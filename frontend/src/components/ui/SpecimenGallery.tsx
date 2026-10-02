import Image from 'next/image';
import type { GallerySpecimen } from '@/lib/gallery/specimens';

interface SpecimenGalleryProps {
  specimens: GallerySpecimen[];
  lang: 'en' | 'am';
}

// Below this many distinct specimens a sliding strip just repeats the same
// photo, which reads as broken. Until the collection has enough
// photography, show the real specimens as a still, centred row instead;
// the marquee switches on automatically once there are enough to slide.
const MIN_FOR_MARQUEE = 4;
// Tiles per pass of the marquee, so the row always overflows the viewport
// and the CSS loop (-50% back to 0%) stays seamless.
const TILES_PER_PASS = 8;

function SpecimenCard({ specimen, lang }: { specimen: GallerySpecimen; lang: 'en' | 'am' }) {
  return (
    <figure className="w-56 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="relative h-40 w-full bg-stone-100">
        <Image
          src={specimen.src}
          alt={lang === 'en' ? specimen.nameEn : specimen.nameAm}
          fill
          className="object-cover"
          sizes="224px"
        />
      </div>
      <figcaption className="px-3 py-2">
        <div className="text-xs font-medium uppercase tracking-wide text-primary-600">
          {lang === 'en' ? specimen.categoryEn : specimen.categoryAm}
        </div>
        <div className="text-sm font-semibold text-stone-900 truncate">
          {lang === 'en' ? specimen.nameEn : specimen.nameAm}
        </div>
      </figcaption>
    </figure>
  );
}

export function SpecimenGallery({ specimens, lang }: SpecimenGalleryProps) {
  if (specimens.length === 0) return null;

  if (specimens.length < MIN_FOR_MARQUEE) {
    return (
      <div className="flex flex-wrap justify-center gap-6">
        {specimens.map((specimen) => (
          <SpecimenCard key={specimen.id} specimen={specimen} lang={lang} />
        ))}
      </div>
    );
  }

  const pass = Array.from(
    { length: TILES_PER_PASS },
    (_, i) => specimens[i % specimens.length]
  );
  const track = [...pass, ...pass];

  return (
    <div className="specimen-marquee overflow-hidden">
      <div className="specimen-marquee-track flex w-max gap-6">
        {track.map((specimen, index) => (
          <SpecimenCard key={`${specimen.id}-${index}`} specimen={specimen} lang={lang} />
        ))}
      </div>
    </div>
  );
}
