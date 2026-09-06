import Image from 'next/image';
import type { GallerySpecimen } from '@/lib/gallery/specimens';

interface SpecimenGalleryProps {
  specimens: GallerySpecimen[];
  lang: 'en' | 'am';
}

// How many tiles make up one pass of the strip. With only one real
// specimen photographed so far, this is what makes the gallery look
// like a gallery instead of one lonely card -- it repeats the roster
// (see specimens.ts) to fill the row, then the row itself is
// duplicated once below so the CSS animation can loop seamlessly from
// -50% back to 0%.
const TILES_PER_PASS = 6;

export function SpecimenGallery({ specimens, lang }: SpecimenGalleryProps) {
  if (specimens.length === 0) return null;

  const pass = Array.from(
    { length: TILES_PER_PASS },
    (_, i) => specimens[i % specimens.length]
  );
  const track = [...pass, ...pass];

  return (
    <div className="specimen-marquee overflow-hidden">
      <div className="specimen-marquee-track flex w-max gap-6">
        {track.map((specimen, index) => (
          <figure
            key={`${specimen.id}-${index}`}
            className="w-56 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
          >
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
        ))}
      </div>
    </div>
  );
}
