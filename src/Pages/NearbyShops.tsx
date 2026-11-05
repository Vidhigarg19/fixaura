import { motion } from 'framer-motion'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, Clock3, MapPin, Navigation, Phone, Search, Wrench } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import PageShell from '../components/PageShell'
import { getLocale, subscribeLocale, t } from '../i18n'
import { findNearbyShops, type NearbyShop, type NearbyShopType } from '../services/nearbyShops'

const RADII = [3, 5, 10, 20] as const
type ShopFilter = 'all' | 'repair' | 'sell'

function getGeolocationError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return 'nearby.locationDenied'
  if (error.code === error.POSITION_UNAVAILABLE) return 'nearby.locationUnavailable'
  return 'nearby.locationTimeout'
}

function getTypeLabel(type: NearbyShopType): string {
  return t(`nearby.types.${type}`)
}

function getPhoneHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 5 || !/^[+\d\s()./;#*-]+$/.test(phone)) return null
  return `tel:${phone.replace(/[^\d+*#;]/g, '')}`
}

export default function NearbyShops() {
  useSyncExternalStore(subscribeLocale, getLocale)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const appliance = searchParams.get('appliance')?.trim() ?? ''
  const [radiusKm, setRadiusKm] = useState<(typeof RADII)[number]>(5)
  const [filter, setFilter] = useState<ShopFilter>('all')
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(
    null
  )
  const [shops, setShops] = useState<NearbyShop[]>([])
  const [locationStatus, setLocationStatus] = useState('nearby.locationNotRequested')
  const [locating, setLocating] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [error, setError] = useState('')
  const [errorDetails, setErrorDetails] = useState('')

  function findShopsNearMe() {
    setError('')
    setErrorDetails('')
    if (coordinates) {
      setSearching(true)
      setSearchAttempt((attempt) => attempt + 1)
      return
    }

    if (!window.isSecureContext) {
      setError('nearby.secureContextRequired')
      return
    }

    if (!navigator.geolocation) {
      setError('nearby.geolocationUnsupported')
      return
    }

    setLocating(true)
    setLocationStatus('nearby.locationRequesting')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          setError('nearby.invalidCoordinates')
          setLocationStatus('nearby.locationFailed')
          setLocating(false)
          return
        }

        setCoordinates({
          latitude,
          longitude,
        })
        setLocationStatus('nearby.locationFound')
        setLocating(false)
        setSearching(true)
      },
      (positionError) => {
        setError(getGeolocationError(positionError))
        setLocationStatus('nearby.locationFailed')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }

  useEffect(() => {
    if (!coordinates) return
    let active = true

    void findNearbyShops(coordinates.latitude, coordinates.longitude, radiusKm)
      .then((results) => {
        if (active) setShops(results)
      })
      .catch((requestError: unknown) => {
        console.error('Nearby shops search failed:', requestError)
        if (active) {
          setError(navigator.onLine ? 'nearby.overpassUnavailable' : 'nearby.internetUnavailable')
          setErrorDetails(
            requestError instanceof Error ? requestError.message : String(requestError)
          )
          setShops([])
        }
      })
      .finally(() => {
        if (active) setSearching(false)
      })

    return () => {
      active = false
    }
  }, [coordinates, radiusKm, searchAttempt])

  function selectRadius(radius: (typeof RADII)[number]) {
    if (coordinates) {
      setError('')
      setErrorDetails('')
      setSearching(true)
      if (radius === radiusKm) {
        setSearchAttempt((attempt) => attempt + 1)
        return
      }
    }
    setRadiusKm(radius)
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

  const googleMapsSearch = new URLSearchParams({
    api: '1',
    query: [
      appliance,
      t('nearby.mapsQuery'),
      coordinates ? `${coordinates.latitude},${coordinates.longitude}` : '',
    ]
      .filter(Boolean)
      .join(' '),
  }).toString()

  return (
    <PageShell className="pb-16">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('nearby.back')}
            </button>
            <LanguageToggle />
          </div>
          <div className="mb-3 flex items-center gap-2 text-primary">
            <MapPin className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-semibold uppercase tracking-wide">
              {t('nearby.eyebrow')}
            </span>
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
              <p className="font-semibold">{t(locationStatus)}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {t('nearby.locationPermissionMessage')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={findShopsNearMe}
            disabled={locating || searching}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {locating || searching ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-background/30 border-t-background" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            {t('nearby.findNearMe')}
          </button>
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
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
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
          role="tablist"
          aria-label={t('nearby.filterLabel')}
        >
          {(['all', 'repair', 'sell'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                filter === value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(`nearby.filters.${value}`)}
            </button>
          ))}
        </div>

        {locating && (
          <div role="status" className="glass-panel mb-5 animate-pulse rounded-xl p-5">
            <div className="mb-3 h-4 w-2/5 rounded bg-surface-high" />
            <div className="h-3 w-3/4 rounded bg-surface-high" />
            <span className="sr-only">{t('nearby.locating')}</span>
          </div>
        )}

        {searching && (
          <div role="status" className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="glass-panel animate-pulse rounded-xl p-5">
                <div className="mb-4 h-5 w-2/3 rounded bg-surface-high" />
                <div className="mb-3 h-3 w-1/2 rounded bg-surface-high" />
                <div className="h-3 w-3/4 rounded bg-surface-high" />
              </div>
            ))}
            <span className="sr-only">{t('nearby.loading')}</span>
          </div>
        )}

        {!searching && error && (
          <div className="glass-panel rounded-xl p-6 text-center">
            <p role="alert" className="mb-4 text-text-secondary">
              {t(error)}
            </p>
            {errorDetails && (
              <p className="mb-4 break-words text-xs text-text-secondary">
                {t('nearby.errorDetails')}: {errorDetails}
              </p>
            )}
            <button
              type="button"
              onClick={findShopsNearMe}
              className="mb-4 rounded-lg border border-border px-4 py-2 font-semibold text-text-secondary hover:border-primary hover:text-primary"
            >
              {t('nearby.tryAgain')}
            </button>
            <br />
            <a
              href={`https://www.google.com/maps/search/?${googleMapsSearch}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-background"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {t('nearby.searchGoogleMaps')}
            </a>
          </div>
        )}

        {searching && (
          <p className="mb-3 text-center text-sm text-text-secondary">
            {t('nearby.loading')}
          </p>
        )}

        {!searching && !error && coordinates && shops.length === 0 && (
          <div className="glass-panel rounded-xl p-6 text-center">
            <Wrench className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
            <p className="mb-2 text-text-secondary">{t('nearby.empty')}</p>
            <p className="mb-4 text-sm text-text-secondary">
              {t(`nearby.increaseRadius${radiusKm}`)}
            </p>
            <a
              href={`https://www.google.com/maps/search/?${googleMapsSearch}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary underline underline-offset-4"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {t('nearby.searchGoogleMaps')}
            </a>
          </div>
        )}

        {!searching && !error && coordinates && shops.length > 0 && visibleShops.length === 0 && (
          <div className="glass-panel rounded-xl p-6 text-center">
            <p className="mb-4 text-text-secondary">{t('nearby.noFilterResults')}</p>
            <a
              href={`https://www.google.com/maps/search/?${googleMapsSearch}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-primary underline underline-offset-4"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {t('nearby.searchGoogleMaps')}
            </a>
          </div>
        )}

        {!searching && !error && visibleShops.length > 0 && (
          <p className="mb-3 text-sm text-text-secondary" role="status">
            {visibleShops.length} {t('nearby.results')}
          </p>
        )}

        {!searching && !error && visibleShops.length > 0 && (
          <ul className="space-y-4">
            {visibleShops.map((shop) => (
              <motion.li
                key={shop.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel rounded-xl p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{shop.name}</h2>
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
                  {shop.distance.toFixed(1)} {t('nearby.kmAway')}
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm text-text-secondary">
                  <span aria-hidden="true" className="w-4 shrink-0 text-center">•</span>
                  <span>{shop.address || t('nearby.addressUnavailable')}</span>
                </p>
                <p className="mt-2 flex items-start gap-2 text-sm text-text-secondary">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>{shop.openingHours || t('nearby.hoursUnavailable')}</span>
                </p>
                {getPhoneHref(shop.phone) && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                    <Phone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{shop.phone}</span>
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${shop.latitude},${shop.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-background"
                  >
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    {t('nearby.directions')}
                  </a>
                  {getPhoneHref(shop.phone) && (
                    <a
                      href={getPhoneHref(shop.phone) ?? undefined}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:border-primary hover:text-primary"
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                      {t('nearby.call')}
                    </a>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        )}

        {!searching && !error && visibleShops.length > 0 && (
          <a
            href={`https://www.google.com/maps/search/?${googleMapsSearch}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {t('nearby.searchGoogleMaps')}
          </a>
        )}

      </main>
    </PageShell>
  )
}
