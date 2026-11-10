import { useId } from 'react';
export function Trophy({ small = false }: { small?: boolean }) {
  const id = useId().replace(/:/g, '');
  return <div className={`trophy-art ${small ? 'small' : ''}`} aria-hidden="true">
    <div className="orbit orbit-one" /><div className="orbit orbit-two" />
    <svg viewBox="0 0 500 560" fill="none">
      <defs>
        <linearGradient id={`${id}-a`} x1="125" y1="30" x2="375" y2="470" gradientUnits="userSpaceOnUse"><stop stopColor="#83fff4" /><stop offset=".34" stopColor="#00d9d3" /><stop offset=".65" stopColor="#5d27ac" /><stop offset="1" stopColor="#9146ff" /></linearGradient>
        <linearGradient id={`${id}-b`} x1="200" y1="110" x2="340" y2="260" gradientUnits="userSpaceOnUse"><stop stopColor="#c1fff9" /><stop offset=".4" stopColor="#2e777d" /><stop offset="1" stopColor="#101629" /></linearGradient>
        <linearGradient id={`${id}-c`} x1="130" y1="100" x2="330" y2="350" gradientUnits="userSpaceOnUse"><stop stopColor="#11444b" /><stop offset=".55" stopColor="#101126" /><stop offset="1" stopColor="#58268c" /></linearGradient>
        <radialGradient id={`${id}-g`}><stop stopColor="#9146ff" stopOpacity=".3" /><stop offset="1" stopColor="#9146ff" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="250" cy="476" rx="210" ry="62" fill={`url(#${id}-g)`} />
      <ellipse cx="250" cy="474" rx="178" ry="38" stroke="#9146ff" strokeOpacity=".24" />
      <ellipse cx="250" cy="474" rx="142" ry="28" stroke="#00d9d3" strokeOpacity=".35" />
      <path d="M155 441L245 413L350 441V460L254 490L155 461Z" fill="#101423" stroke="#7044ac" />
      <path d="M155 441L254 468L350 441M254 468V490" stroke="#00d9d3" strokeOpacity=".7" />
      <path d="M196 428L249 411L304 428L251 445Z" fill={`url(#${id}-a)`} />
      <path d="M230 326L267 319L277 421L251 436L226 423Z" fill={`url(#${id}-c)`} stroke="#6864a2" />
      <path d="M251 338V430L277 421L267 319Z" fill={`url(#${id}-a)`} opacity=".45" />
      <path d="M151 116L113 103L105 170L144 239L201 260L189 231L161 217L132 166L137 132L158 141" fill={`url(#${id}-c)`} stroke="#00d9d3" strokeWidth="2" />
      <path d="M345 116L384 103L394 170L355 239L299 260L310 231L338 217L367 166L361 132L340 141" fill={`url(#${id}-c)`} stroke="#a76dff" strokeWidth="2" />
      <path d="M151 88L250 60L349 88L326 245L282 317L250 344L217 317L175 245Z" fill={`url(#${id}-c)`} stroke={`url(#${id}-a)`} strokeWidth="2.5" />
      <path d="M151 88L250 118L349 88L250 60Z" fill={`url(#${id}-b)`} stroke="#75ede8" />
      <path d="M250 118V344L282 317L326 245L349 88Z" fill={`url(#${id}-a)`} opacity=".24" />
      <path d="M151 88L217 317L250 344L175 245Z" fill="#00d9d3" opacity=".12" />
      <path d="M250 118V344M175 245L250 269L326 245M151 88L250 269L349 88" stroke={`url(#${id}-a)`} strokeOpacity=".55" />
      <path d="M279 156L226 142L202 205L255 220L265 195L237 188L244 171L270 179Z" fill="#b0fff8" />
      <path d="M270 202L284 206L278 223L264 219Z" fill="#b995ff" />
      <path d="M155 91L176 242M253 64L345 89" stroke="#ccfff9" strokeWidth="2" />
      <path d="M87 297L95 297M91 293V301M389 285H401M395 279V291M331 46H339M335 42V50" stroke="#00d9d3" />
      <circle cx="122" cy="355" r="2" fill="#9146ff" /><circle cx="373" cy="378" r="2" fill="#00d9d3" />
    </svg>
    <span className="art-coordinate">C63 / TROPHY — 2026</span>
  </div>;
}
