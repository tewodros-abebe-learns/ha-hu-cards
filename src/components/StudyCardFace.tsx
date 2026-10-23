import { memo } from 'react';
import type { FlashcardData } from '../models';
import { resolveCardImageUrl } from '../sampleCardsData';

/**
 * One physical side of a study card. The back face is pre-rotated so it reads
 * correctly once its parent has turned around; both faces hide their reverse
 * side, which keeps text and images from appearing mirrored mid-flip.
 */
export const StudyCardFace = memo(({ card, side, hidden }: { card: FlashcardData; side: 'front' | 'back'; hidden: boolean }) => {
  const image = resolveCardImageUrl(side === 'front' ? card.frontImageUrl : card.backImageUrl);
  const text = side === 'front' ? card.frontText : card.backText;
  return <div aria-hidden={hidden} data-card-face={side}
    className={`${side === 'front' ? 'relative w-full min-h-[220px] sm:min-h-[300px]' : 'absolute inset-0 w-full h-full [transform:rotateY(180deg)]'} [backface-visibility:hidden] [-webkit-backface-visibility:hidden] rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-neutral-700/70 bg-neutral-900`}
    style={side === 'front' ? { aspectRatio: card.aspectRatio || 1, maxHeight: '62vh' } : undefined}>
    {image && <img src={image} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-contain" referrerPolicy="no-referrer" />}
    {text && <div className={`absolute inset-0 overflow-y-auto p-6 flex flex-col ${image ? 'bg-black/35' : ''}`}>
      <p className="font-extrabold text-center drop-shadow-md tracking-tight whitespace-pre-wrap break-words shrink-0"
        style={{ fontSize: card.textSize || 24, color: card.textColor || '#ffffff', overflowWrap: 'anywhere', marginTop: card.verticalAlign === 'top' ? 0 : 'auto', marginBottom: card.verticalAlign === 'bottom' ? 0 : 'auto' }}>{text}</p>
    </div>}
  </div>;
});

/**
 * Shared focus stage used by Speed Recall, Lock-In and Spaced Review so the
 * same card layout, image handling and smooth flip appear in every mode.
 */
export function FlipCardStage({ card, flipped, className = '' }: { card: FlashcardData; flipped: boolean; className?: string }) {
  return <div className={`w-full max-w-[520px] [perspective:1600px] ${className}`}>
    <div data-flip-stage data-flipped={flipped} aria-live="polite"
      className="relative w-full [transform-style:preserve-3d] transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
      style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
      <StudyCardFace card={card} side="front" hidden={flipped} />
      {/* The answer is not rendered at all before reveal, so it cannot be read from the DOM or a screen reader. */}
      {flipped && <StudyCardFace card={card} side="back" hidden={false} />}
    </div>
  </div>;
}
