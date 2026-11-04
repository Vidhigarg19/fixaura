type LogoProps = {
  size: number
  alt?: string
}

export default function Logo({ size, alt = '' }: LogoProps) {
  return (
    <img
      src="/fixaura-logo.png"
      alt={alt}
      width={size}
      height={size}
      className="shrink-0 object-contain"
    />
  )
}
