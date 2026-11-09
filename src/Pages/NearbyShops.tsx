import { motion } from 'framer-motion'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import {
  ArrowLeft,
  Clock3,
  ExternalLink,
  Globe,
  MapPin,
  Navigation,
  Phone,
  Search,
  Wrench,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import PageShell from '../components/PageShell'
import { getLocale, subscribeLocale, t } from '../i18n'
import {
  buildExternalSearchUrl,
  findNearbyShops,
  isValidArea,
  NearbySearchError,
  type NearbySearchErrorCode,
  type NearbyShop,
  type NearbyShopType,
} from '../services/nearbyShops'
import { googleMapsDirectionsUrl, OSM_COPYRIGHT_URL } from '../config/externalUrls'
import { GEOLOCATION_OPTIONS, NEARBY_RADII_KM } from '../config/limits'

const RADII = NEARBY_RADII_KM
type Radius = (typeof RADII)[number]
type ShopFilter = 'all' | 'repair' | 'sell'
type Coordinates = { latitude: number; longitude: number }
type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; code: NearbySearchErrorCode }

function getGeolocationError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return 'nearby.locationDenied'
  if (error.code === error.POSITION_UNAVAILABLE) return 'nearby.locationUnavailable'
  return 'nearby.locationTimeout'
}

function getSearchErrorKey(code: NearbySearchErrorCode): string {
  if (code === 'offline') return 'nearby.internetUnavailable'
  if (code === 'busy') return 'nearby.errorBusy'
  if (code === 'timeout') return 'nearby.errorTimeout'
  if (code === 'invalid_input') return 'nearby.invalidCoordinates'
  return 'nearby.overpassUnavailable'
}

function getTypeLabel(type: NearbyShopType): string {
  return t(`nearby.types.${type}`)
}

function getPhoneHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 5 || !/^[+\d\s()./#*-]+$/.test(phone)) return null
  return `tel:${phone.replace(/[^\d+*#]/g, '')}`
}

function formatDistance(distanceKm: number): string {
  return distanceKm < 0.1 ? '< 0.1' : distanceKm.toFixed(1)
}

function ExternalSearchLink({
  href,
  sharesLocation,
}: {
  href: string
  sharesLocation: boolean
}) {
  return (
    <div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        {t('nearby.searchGoogleMaps')}
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
      <p className="mt-2 text-xs text-text-secondary">
        {t('nearby.externalNote')}
        {sharesLocation && <> {t('nearby.externalLocationNote')}</>}
      </p>
    </div>
  )
}

export default function NearbyShops() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const appliance = (searchParams.get('appliance')?.trim() ?? '').slice(0, 60)
  const [radiusKm, setRadiusKm] = useState<Radius>(5)
  const [filter, setFilter] = useState<ShopFilter>('all')
  // Exact coordinates live only in this component's memory: never stored or logged.
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [shops, setShops] = useState<NearbyShop[]>([])
  const [locating, setLocating] = useState(false)
  const [locationIssue, setLocationIssue] = useState('')
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [area, setArea] = useState('')
  const [areaTouched, setAreaTouched] = useState(false)
  const locateRequest = useRef(0)

  // Ignore a late geolocation callback if the user has already left the page.
  useEffect(() => {
    const request = locateRequest
    return () => {
      request.current += 1
    }
  }, [])

  // One cancellable directory search per (location, radius, attempt). Changing any of
  // them, or leaving the page, aborts the request in flight, so an old response can
  // never replace newer results and no request keeps running unnecessarily.
  useEffect(() => {
    if (!coordinates) return
    const controller = new AbortController()

    findNearbyShops(coordinates.latitude, coordinates.longitude, radiusKm, controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return
        setShops(results)
        setSearch({ status: 'success' })
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return
        const code: NearbySearchErrorCode =
          requestError instanceof NearbySearchError ? requestError.code : 'unavailable'
        if (code === 'cancelled') return
        console.warn('Nearby directory search failed:', code)
        setShops([])
        setSearch({ status: 'error', code })
      })

    return () => controller.abort()
  }, [coordinates, radiusKm, searchAttempt])

  const searching = search.status === 'loading'

  function beginSearch() {
    setSearch({ status: 'loading' })
    setSearchAttempt((attempt) => attempt + 1)
  }

  function requestLocation() {
    if (locating || searching) return
    setLocationIssue('')

    if (coordinates) {
      beginSearch()
      return
    }
    if (!window.isSecureContext) {
      setLocationIssue('nearby.secureContextRequired')
      return
    }
    if (!navigator.geolocation) {
      setLocationIssue('nearby.geolocationUnsupported')
      return
    }

    const requestId = locateRequest.current + 1
    locateRequest.current = requestId
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== locateRequest.current) return
        const { latitude, longitude } = position.coords
        setLocating(false)
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          setLocationIssue('nearby.invalidCoordinates')
          return
        }
        setCoordinates({ latitude, longitude })
        setSearch({ status: 'loading' })
      },
      (positionError) => {
        if (requestId !== locateRequest.current) return
        setLocating(false)
        setLocationIssue(getGeolocationError(positionError))
      },
      { ...GEOLOCATION_OPTIONS }
    )
  }

  function selectRadius(radius: Radius) {
    if (radius === radiusKm) return
    setRadiusKm(radius)
    // The effect aborts any pending request for the old radius and starts a new one.
    if (coordinates) setSearch({ status: 'loading' })
  }

  const visibleShops = useMemo(
    () =>
      shops.filter((shop) => {
        if (filter === 'repair') return shop.type === 'repair' || shop.type === 'both'
        if (filter === 'sell') return shop.type === 'sell' || shop.type === 'both'
        return true
      }),
    [filter, shops]
  )

  const areaText = area.trim()
  const areaValid = isValidArea(areaText)
  const searchArea = areaValid ? areaText : ''
  const sharesLocation = !searchArea && Boolean(coordinates)
  const categoryTerms =
    filter === 'repair'
      ? t('nearby.mapsQueryRepair')
      : filter === 'sell'
        ? t('nearby.mapsQuerySell')
        : t('nearby.mapsQuery')
  const externalUrl = buildExternalSearchUrl(
    [appliance, categoryTerms].filter(Boolean).join(' '),
    searchArea,
    searchArea ? null : coordinates
  )

  function submitArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAreaTouched(true)
    if (!areaValid) return
    window.open(externalUrl, '_blank', 'noopener,noreferrer')
  }

  const statusKey = locating
    ? 'nearby.locationRequesting'
    : searching
      ? 'nearby.loading'
      : locationIssue && !coordinates
        ? 'nearby.locationFailed'
        : coordinates
          ? 'nearby.locationFound'
          : 'nearby.locationNotRequested'
  const showAreaError = areaTouched && !areaValid
  const canRetryLocation =
    locationIssue !== 'nearby.secureContextRequired' &&
    locationIssue !== 'nearby.geolocationUnsupported'
  const hasResults = search.status === 'success' && shops.length > 0

  return (
    <PageShell className="pb-16">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('nearby.back')}
            </button>
            <LanguageToggle />
          </div>
          <div className="mb-3 flex items-center gap-2 text-primary">
            <MapPin className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-semibold">{t('nearby.eyebrow')}</span>
          </div>
          <h1 className="text-heading-lg">{t('nearby.title')}</h1>
          <p className="mt-2 text-text-secondary">{t('nearby.subtitle')}</p>
          {appliance && (
            <p className="mt-2 text-sm text-text-secondary">
              {t('nearby.applianceDescription')} {appliance}
            </p>
          )}
        </div>

        <section className="glass-panel mb-6 rounded-xl p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p role="status" className="font-semibold">
                {t(statusKey)}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {t('nearby.locationPermissionMessage')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestLocation}
            disabled={locating || searching}
            aria-busy={locating || searching}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {locating || searching ? (
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background"
                aria-hidden="true"
              />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            {t('nearby.findNearMe')}
          </button>

          {locationIssue && !coordinates && !locating && (
            <div className="mt-5 border-t border-border pt-5">
              <p role="alert" className="mb-4 text-text-secondary">
                {t(locationIssue)}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {canRetryLocation && (
                  <button
                    type="button"
                    onClick={requestLocation}
                    className="rounded-lg border border-border px-4 py-2 font-semibold text-text-secondary hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {t('nearby.tryAgain')}
                  </button>
                )}
                <ExternalSearchLink href={externalUrl} sharesLocation={sharesLocation} />
              </div>
            </div>
          )}
        </section>

        <section
          className="glass-panel mb-6 rounded-xl p-5 sm:p-6"
          aria-labelledby="nearby-area-heading"
        >
          <h2 id="nearby-area-heading" className="font-semibold">
            {t('nearby.externalHeading')}
          </h2>
          <form onSubmit={submitArea} noValidate className="mt-3">
            <label htmlFor="nearby-area" className="block text-sm font-medium">
              {t('nearby.areaLabel')}
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="nearby-area"
                type="text"
                value={area}
                maxLength={80}
                autoComplete="off"
                onChange={(event) => setArea(event.target.value)}
                onBlur={() => {
                  if (area.trim()) setAreaTouched(true)
                }}
                placeholder={t('nearby.areaPlaceholder')}
                aria-invalid={showAreaError}
                aria-describedby={
                  showAreaError ? 'nearby-area-help nearby-area-error' : 'nearby-area-help'
                }
                className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-text-primary placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-primary"
              />
              <button
                type="submit"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-primary px-5 font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                {t('nearby.searchGoogleMaps')}
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <p id="nearby-area-help" className="mt-2 text-xs text-text-secondary">
              {t('nearby.areaHelp')}
            </p>
            {showAreaError && (
              <p id="nearby-area-error" role="alert" className="mt-2 text-sm text-error">
                {t('nearby.areaInvalid')}
              </p>
            )}
            <p className="mt-2 text-xs text-text-secondary">{t('nearby.externalNote')}</p>
          </form>
        </section>

        <section className="glass-panel mb-6 rounded-xl p-4 sm:p-5" aria-label={t('nearby.radius')}>
          <h2 className="mb-3 font-semibold">{t('nearby.radius')}</h2>
          <div className="flex flex-wrap gap-2">
            {RADII.map((radius) => (
              <button
                key={radius}
                type="button"
                aria-pressed={radiusKm === radius}
                onClick={() => selectRadius(radius)}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  radiusKm === radius
                    ? 'border-primary bg-primary text-background'
                    : 'border-border text-text-secondary hover:border-primary hover:text-primary'
                }`}
              >
                {radius} {t('nearby.km')}
              </button>
            ))}
          </div>
        </section>

        <div
          className="mb-5 flex gap-2 border-b border-border"
          role="group"
          aria-label={t('nearby.filterLabel')}
        >
          {(['all', 'repair', 'sell'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-11 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                filter === value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(`nearby.filters.${value}`)}
            </button>
          ))}
        </div>

        {(locating || searching) && (
          <div aria-hidden="true" className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="glass-panel animate-pulse rounded-xl p-5">
                <div className="mb-4 h-5 w-2/3 rounded bg-surface-high" />
                <div className="mb-3 h-3 w-1/2 rounded bg-surface-high" />
                <div className="h-3 w-3/4 rounded bg-surface-high" />
              </div>
            ))}
          </div>
        )}

        {!searching && search.status === 'error' && (
          <div className="glass-panel rounded-xl p-6 text-center">
            <p role="alert" className="mb-4 text-text-secondary">
              {t(getSearchErrorKey(search.code))}
            </p>
            <div className="flex flex-col items-center gap-4">
              {search.code !== 'invalid_input' && (
                <button
                  type="button"
                  onClick={requestLocation}
                  className="rounded-lg border border-border px-4 py-2 font-semibold text-text-secondary hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {t('nearby.tryAgain')}
                </button>
              )}
              <ExternalSearchLink href={externalUrl} sharesLocation={sharesLocation} />
            </div>
          </div>
        )}

        {!searching && search.status === 'success' && shops.length === 0 && (
          <div className="glass-panel rounded-xl p-6 text-center">
            <Wrench className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
            <p role="status" className="mb-2 text-text-secondary">
              {t('nearby.empty')}
            </p>
            <p className="mb-4 text-sm text-text-secondary">
              {t(`nearby.increaseRadius${radiusKm}`)}
            </p>
            <div className="flex justify-center">
              <ExternalSearchLink href={externalUrl} sharesLocation={sharesLocation} />
            </div>
          </div>
        )}

        {!searching && hasResults && visibleShops.length === 0 && (
          <div className="glass-panel rounded-xl p-6 text-center">
            <p role="status" className="mb-4 text-text-secondary">
              {t('nearby.noFilterResults')}
            </p>
            <div className="flex justify-center">
              <ExternalSearchLink href={externalUrl} sharesLocation={sharesLocation} />
            </div>
          </div>
        )}

        {!searching && hasResults && visibleShops.length > 0 && (
          <>
            <p className="mb-3 text-sm text-text-secondary" role="status">
              {visibleShops.length} {t('nearby.results')}
            </p>
            <ul className="space-y-4">
              {visibleShops.map((shop) => {
                const phoneHref = getPhoneHref(shop.phone)
                return (
                  <motion.li
                    key={shop.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel rounded-xl p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="break-words text-lg font-semibold">{shop.name}</h2>
                        <p className="mt-1 text-sm text-text-secondary">
                          {t(`nearby.categories.${shop.category}`)}
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {getTypeLabel(shop.type)}
                      </span>
                    </div>

                    <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      {t('nearby.distancePrefix')} {formatDistance(shop.distance)}{' '}
                      {t('nearby.distanceSuffix')}
                    </p>
                    {shop.address && (
                      <p className="mt-2 flex items-start gap-2 text-sm text-text-secondary">
                        <span aria-hidden="true" className="w-4 shrink-0 text-center">
                          •
                        </span>
                        <span className="break-words">{shop.address}</span>
                      </p>
                    )}
                    {shop.openingHours && (
                      <p className="mt-2 flex items-start gap-2 text-sm text-text-secondary">
                        <Clock3
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span className="break-words">
                          <span className="sr-only">{t('nearby.hoursLabel')} </span>
                          {shop.openingHours}
                        </span>
                      </p>
                    )}
                    {phoneHref && (
                      <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                        <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{shop.phone}</span>
                      </p>
                    )}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <a
                        href={googleMapsDirectionsUrl(shop.latitude, shop.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <Navigation className="h-4 w-4" aria-hidden="true" />
                        {t('nearby.directions')}
                      </a>
                      {phoneHref && (
                        <a
                          href={phoneHref}
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <Phone className="h-4 w-4" aria-hidden="true" />
                          {t('nearby.call')}
                        </a>
                      )}
                      {shop.website && (
                        <a
                          href={shop.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <Globe className="h-4 w-4" aria-hidden="true" />
                          {t('nearby.website')}
                        </a>
                      )}
                    </div>
                  </motion.li>
                )
              })}
            </ul>
            <div className="mt-6">
              <ExternalSearchLink href={externalUrl} sharesLocation={sharesLocation} />
            </div>
          </>
        )}

        <p className="mt-8 text-xs text-text-secondary">
          {t('nearby.attributionNote')}{' '}
          <a
            href={OSM_COPYRIGHT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
          >
            {t('nearby.attributionLink')}
          </a>
        </p>
      </div>
    </PageShell>
  )
}
