const fs = require('fs');
const path = require('path');

// Helper to wrap SVG into base64 Data URI
function svgToDataUri(svgString) {
  const base64 = Buffer.from(svgString).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

const cards = {
  physics_1_front: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="cyanGlow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  
  <rect width="800" height="450" fill="url(#bg)" rx="16"/>
  
  <!-- Grid Lines -->
  <path d="M 50 380 L 750 380 M 100 50 L 100 400" stroke="#334155" stroke-width="2" stroke-dasharray="6,6"/>
  
  <!-- Parabolic Trajectory -->
  <path d="M 100 380 Q 400 60 700 380" fill="none" stroke="url(#cyanGlow)" stroke-width="5" filter="url(#glow)"/>
  
  <!-- Velocity & Force Vectors -->
  <!-- At peak -->
  <circle cx="400" cy="140" r="12" fill="#f43f5e" filter="url(#glow)"/>
  <!-- Velocity Vector Vx -->
  <line x1="400" y1="140" x2="520" y2="140" stroke="#38bdf8" stroke-width="4" marker-end="url(#arrow)" filter="url(#glow)"/>
  <text x="530" y="145" fill="#38bdf8" font-family="sans-serif" font-weight="bold" font-size="20">v_x</text>
  
  <!-- Force Vector Fg -->
  <line x1="400" y1="140" x2="400" y2="250" stroke="#f43f5e" stroke-width="4" filter="url(#glow)"/>
  <text x="410" y="240" fill="#f43f5e" font-family="sans-serif" font-weight="bold" font-size="20">F_g = m·g</text>

  <!-- Title & Formula Overlay -->
  <rect x="40" y="30" width="320" height="60" rx="12" fill="#1e293b" opacity="0.85" stroke="#475569" stroke-width="1.5"/>
  <text x="60" y="68" fill="#f8fafc" font-family="sans-serif" font-size="24" font-weight="900" letter-spacing="1">PHYSICS I: KINEMATICS</text>
  
  <rect x="520" y="30" width="240" height="60" rx="12" fill="#0f172a" opacity="0.9" stroke="#3b82f6" stroke-width="2"/>
  <text x="540" y="68" fill="#38bdf8" font-family="sans-serif" font-size="22" font-weight="bold">F_net = m · a</text>
</svg>
  `,

  physics_1_back: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#090d16" rx="16"/>
  <rect x="30" y="30" width="740" height="390" fill="#111827" rx="16" stroke="#1f2937" stroke-width="2"/>
  
  <text x="60" y="75" fill="#38bdf8" font-family="sans-serif" font-size="26" font-weight="900" letter-spacing="1">NEWTON'S LAWS OF MOTION</text>
  
  <!-- Law 1 -->
  <rect x="60" y="100" width="680" height="85" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="80" y="130" fill="#f43f5e" font-family="sans-serif" font-size="18" font-weight="bold">1st Law (Inertia):</text>
  <text x="80" y="160" fill="#e2e8f0" font-family="sans-serif" font-size="16">An object remains at rest or constant velocity unless acted upon by a net force.</text>
  
  <!-- Law 2 -->
  <rect x="60" y="200" width="680" height="85" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="80" y="230" fill="#38bdf8" font-family="sans-serif" font-size="18" font-weight="bold">2nd Law (Force &amp; Acceleration):</text>
  <text x="80" y="260" fill="#e2e8f0" font-family="sans-serif" font-size="16">Acceleration is proportional to net force: F = m · a  |  a = Δv / Δt</text>
  
  <!-- Law 3 -->
  <rect x="60" y="300" width="680" height="85" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="80" y="330" fill="#a855f7" font-family="sans-serif" font-size="18" font-weight="bold">3rd Law (Action &amp; Reaction):</text>
  <text x="80" y="360" fill="#e2e8f0" font-family="sans-serif" font-size="16">For every action force, there is an equal and opposite reaction force: F_A = -F_B</text>
</svg>
  `,

  biology_dna_front: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="bioBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#022c22"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#bioBg)" rx="16"/>
  
  <!-- DNA Double Helix Representation -->
  <path d="M 150 100 Q 300 225 450 100 T 750 100" fill="none" stroke="#10b981" stroke-width="6"/>
  <path d="M 150 350 Q 300 225 450 350 T 750 350" fill="none" stroke="#06b6d4" stroke-width="6"/>
  
  <!-- Base Rungs -->
  <line x1="200" y1="135" x2="200" y2="315" stroke="#f43f5e" stroke-width="4"/>
  <line x1="300" y1="225" x2="300" y2="225" stroke="#fbbf24" stroke-width="8"/>
  <line x1="400" y1="135" x2="400" y2="315" stroke="#a855f7" stroke-width="4"/>
  <line x1="500" y1="225" x2="500" y2="225" stroke="#3b82f6" stroke-width="8"/>
  <line x1="600" y1="135" x2="600" y2="315" stroke="#10b981" stroke-width="4"/>
  
  <rect x="50" y="30" width="380" height="55" rx="12" fill="#065f46" opacity="0.9" stroke="#10b981" stroke-width="1.5"/>
  <text x="70" y="66" fill="#ecfdf5" font-family="sans-serif" font-size="22" font-weight="900" letter-spacing="1">BIOLOGY: DNA STRUCTURE</text>
  
  <rect x="520" y="360" width="240" height="50" rx="10" fill="#022c22" opacity="0.9" stroke="#059669" stroke-width="1.5"/>
  <text x="540" y="392" fill="#6ee7b7" font-family="sans-serif" font-size="18" font-weight="bold">Base Pairing: A-T | G-C</text>
</svg>
  `,

  biology_dna_back: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#022c22" rx="16"/>
  <rect x="30" y="30" width="740" height="390" fill="#064e3b" rx="16" stroke="#059669" stroke-width="2"/>
  
  <text x="60" y="75" fill="#6ee7b7" font-family="sans-serif" font-size="26" font-weight="900" letter-spacing="1">NUCLEIC ACIDS: DNA VS RNA</text>
  
  <rect x="60" y="105" width="325" height="280" rx="12" fill="#022c22" stroke="#10b981" stroke-width="1.5"/>
  <text x="80" y="140" fill="#34d399" font-family="sans-serif" font-size="20" font-weight="bold">DNA (Deoxyribonucleic Acid)</text>
  <text x="80" y="175" fill="#a7f3d0" font-family="sans-serif" font-size="15">• Double-stranded helix</text>
  <text x="80" y="205" fill="#a7f3d0" font-family="sans-serif" font-size="15">• Sugar: Deoxyribose</text>
  <text x="80" y="235" fill="#a7f3d0" font-family="sans-serif" font-size="15">• Bases: Adenine (A), Thymine (T),</text>
  <text x="98" y="260" fill="#a7f3d0" font-family="sans-serif" font-size="15">Guanine (G), Cytosine (C)</text>
  <text x="80" y="295" fill="#a7f3d0" font-family="sans-serif" font-size="15">• Function: Long-term genetic store</text>

  <rect x="415" y="105" width="325" height="280" rx="12" fill="#022c22" stroke="#06b6d4" stroke-width="1.5"/>
  <text x="435" y="140" fill="#38bdf8" font-family="sans-serif" font-size="20" font-weight="bold">RNA (Ribonucleic Acid)</text>
  <text x="435" y="175" fill="#bae6fd" font-family="sans-serif" font-size="15">• Single-stranded</text>
  <text x="435" y="205" fill="#bae6fd" font-family="sans-serif" font-size="15">• Sugar: Ribose</text>
  <text x="435" y="235" fill="#bae6fd" font-family="sans-serif" font-size="15">• Bases: Adenine (A), Uracil (U),</text>
  <text x="453" y="260" fill="#bae6fd" font-family="sans-serif" font-size="15">Guanine (G), Cytosine (C)</text>
  <text x="435" y="295" fill="#bae6fd" font-family="sans-serif" font-size="15">• Function: Protein synthesis messenger</text>
</svg>
  `,

  biology_heart_front: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#18181b" rx="16"/>
  
  <!-- Left Side (Deoxygenated - Blue) -->
  <path d="M 320 120 Q 260 180 280 280 Q 320 380 400 400 Z" fill="#1d4ed8" opacity="0.85" stroke="#3b82f6" stroke-width="3"/>
  <!-- Right Side (Oxygenated - Red) -->
  <path d="M 480 120 Q 540 180 520 280 Q 480 380 400 400 Z" fill="#b91c1c" opacity="0.85" stroke="#ef4444" stroke-width="3"/>

  <!-- Labels -->
  <text x="210" y="160" fill="#60a5fa" font-family="sans-serif" font-size="18" font-weight="bold">Right Atrium</text>
  <line x1="230" y1="170" x2="330" y2="180" stroke="#60a5fa" stroke-width="2"/>

  <text x="180" y="300" fill="#60a5fa" font-family="sans-serif" font-size="18" font-weight="bold">Right Ventricle</text>
  <line x1="210" y1="310" x2="340" y2="300" stroke="#60a5fa" stroke-width="2"/>

  <text x="510" y="160" fill="#f87171" font-family="sans-serif" font-size="18" font-weight="bold">Left Atrium</text>
  <line x1="510" y1="170" x2="450" y2="180" stroke="#f87171" stroke-width="2"/>

  <text x="530" y="300" fill="#f87171" font-family="sans-serif" font-size="18" font-weight="bold">Left Ventricle</text>
  <line x1="530" y1="310" x2="450" y2="300" stroke="#f87171" stroke-width="2"/>

  <rect x="50" y="30" width="380" height="55" rx="12" fill="#27272a" stroke="#52525b" stroke-width="1.5"/>
  <text x="70" y="66" fill="#f4f4f5" font-family="sans-serif" font-size="22" font-weight="900" letter-spacing="1">ANATOMY OF THE HEART</text>
</svg>
  `,

  biology_heart_back: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#18181b" rx="16"/>
  <rect x="30" y="30" width="740" height="390" fill="#27272a" rx="16" stroke="#3f3f46" stroke-width="2"/>

  <text x="60" y="75" fill="#f43f5e" font-family="sans-serif" font-size="26" font-weight="900" letter-spacing="1">BLOOD CIRCULATION PATHWAY</text>

  <!-- Flow Steps -->
  <rect x="60" y="110" width="680" height="60" rx="10" fill="#18181b" stroke="#2563eb" stroke-width="2"/>
  <text x="80" y="145" fill="#60a5fa" font-family="sans-serif" font-size="16" font-weight="bold">1. Body → Vena Cava → Right Atrium → Right Ventricle → Pulmonary Artery (To Lungs)</text>

  <rect x="60" y="190" width="680" height="60" rx="10" fill="#18181b" stroke="#10b981" stroke-width="2"/>
  <text x="80" y="225" fill="#34d399" font-family="sans-serif" font-size="16" font-weight="bold">2. Lungs: Gas Exchange (CO₂ released, O₂ absorbed in capillaries)</text>

  <rect x="60" y="270" width="680" height="60" rx="10" fill="#18181b" stroke="#dc2626" stroke-width="2"/>
  <text x="80" y="305" fill="#f87171" font-family="sans-serif" font-size="16" font-weight="bold">3. Pulmonary Vein → Left Atrium → Left Ventricle → Aorta → Rest of Body</text>

  <text x="60" y="380" fill="#a1a1aa" font-family="sans-serif" font-size="14" font-weight="bold">• Deoxygenated Blood: Right Heart | Oxygenated Blood: Left Heart</text>
</svg>
  `,

  chemo_acid_base_front: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <defs>
    <linearGradient id="phGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ef4444"/>
      <stop offset="25%" stop-color="#f97316"/>
      <stop offset="50%" stop-color="#eab308"/>
      <stop offset="75%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="#0f172a" rx="16"/>

  <rect x="50" y="30" width="380" height="55" rx="12" fill="#1e293b" stroke="#475569" stroke-width="1.5"/>
  <text x="70" y="66" fill="#f8fafc" font-family="sans-serif" font-size="22" font-weight="900" letter-spacing="1">CHEMISTRY: THE pH SCALE</text>

  <!-- pH Scale Bar -->
  <rect x="60" y="160" width="680" height="80" rx="16" fill="url(#phGradient)" stroke="#64748b" stroke-width="2"/>

  <!-- pH Numbers -->
  <text x="70" y="210" fill="#ffffff" font-family="sans-serif" font-size="28" font-weight="900">0</text>
  <text x="390" y="210" fill="#ffffff" font-family="sans-serif" font-size="28" font-weight="900">7</text>
  <text x="710" y="210" fill="#ffffff" font-family="sans-serif" font-size="28" font-weight="900">14</text>

  <text x="80" y="290" fill="#f87171" font-family="sans-serif" font-size="20" font-weight="bold">ACIDIC (High H⁺)</text>
  <text x="360" y="290" fill="#facc15" font-family="sans-serif" font-size="20" font-weight="bold">NEUTRAL</text>
  <text x="560" y="290" fill="#a78bfa" font-family="sans-serif" font-size="20" font-weight="bold">BASIC / ALKALINE (High OH⁻)</text>
</svg>
  `,

  chemo_acid_base_back: `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#0f172a" rx="16"/>
  <rect x="30" y="30" width="740" height="390" fill="#1e293b" rx="16" stroke="#334155" stroke-width="2"/>

  <text x="60" y="75" fill="#38bdf8" font-family="sans-serif" font-size="26" font-weight="900" letter-spacing="1">ACID VS BASE CHARACTERISTICS</text>

  <rect x="60" y="110" width="325" height="270" rx="12" fill="#0f172a" stroke="#ef4444" stroke-width="1.5"/>
  <text x="80" y="145" fill="#f87171" font-family="sans-serif" font-size="20" font-weight="bold">Acids (pH &lt; 7)</text>
  <text x="80" y="180" fill="#e2e8f0" font-family="sans-serif" font-size="15">• Proton (H⁺) Donors</text>
  <text x="80" y="210" fill="#e2e8f0" font-family="sans-serif" font-size="15">• Turn Litmus paper RED</text>
  <text x="80" y="240" fill="#e2e8f0" font-family="sans-serif" font-size="15">• Sour taste (e.g. Lemon, HCl)</text>
  <text x="80" y="270" fill="#e2e8f0" font-family="sans-serif" font-size="15">• Formula: pH = -log[H⁺]</text>

  <rect x="415" y="110" width="325" height="270" rx="12" fill="#0f172a" stroke="#8b5cf6" stroke-width="1.5"/>
  <text x="435" y="145" fill="#a78bfa" font-family="sans-serif" font-size="20" font-weight="bold">Bases (pH &gt; 7)</text>
  <text x="435" y="180" fill="#e2e8f0" font-family="sans-serif" font-size="15">• Proton (H⁺) Acceptors / OH⁻ donors</text>
  <text x="435" y="210" fill="#e2e8f0" font-family="sans-serif" font-size="15">• Turn Litmus paper BLUE</text>
  <text x="435" y="240" fill="#e2e8f0" font-family="sans-serif" font-size="15">• Bitter taste, slippery feel (e.g. Soap, NaOH)</text>
  <text x="435" y="270" fill="#e2e8f0" font-family="sans-serif" font-size="15">• Neutralization: Acid + Base → Salt + H₂O</text>
</svg>
  `
};

const outputMap = {};
const publicDir = path.join(__dirname, '../public/sample_cards');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

Object.keys(cards).forEach(key => {
  const svgStr = cards[key].trim();
  const dataUri = svgToDataUri(svgStr);
  outputMap[key] = dataUri;

  // Save SVG file to public folder
  fs.writeFileSync(path.join(publicDir, `${key}.svg`), svgStr);
});

// Output TS file
const tsContent = `// Auto-generated sample card vector image data URIs
export const SAMPLE_CARD_IMAGES: Record<string, string> = ${JSON.stringify(outputMap, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '../src/sampleCardsData.ts'), tsContent);
console.log('Successfully generated sample cards vector assets!');
