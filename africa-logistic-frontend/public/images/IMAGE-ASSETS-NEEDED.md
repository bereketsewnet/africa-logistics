# Images needed for the Africa Logistics public homepage

Generate each image with the AI prompt below, **export/compress to `.webp`**, and drop it into the
folder shown with the **exact file name**. The code already references these names, so the moment a
file exists it appears automatically — no code changes needed. Until then, each slot shows a clean
green‑gradient (or initials) placeholder, so the site never looks broken.

- Brand colours to nudge the generator toward: green `#61941f` / `#71ad25` / `#3e6113`.
- Keep images **text‑free and watermark‑free**.
- Match the ratio; the pixel size is a good target (you can go 1.5–2× larger for retina, keep the
  ratio).
- All files **must** end in `.webp`.

---

## 0. Hero background carousel (2 NEW slides)
The hero rotates through **3 backgrounds** (auto-advances every 6s; the bottom-right ← → control
steps manually). Slide 1 is the existing `bg.webp` (truck on the highway). These next two are
**not trucks** — they're the *emotional* and *trust* moments of the brand: a happy customer
receiving their delivery, and the live tracking that makes every driver accountable.

- **Put them in:** `africa-logistic-frontend/public/images/` ✅ (already added)
- **Exact file names:** `hero-2.webp` and `hero-3.webp`
- **Aspect ratio:** ≈ 1.94:1 (match `bg.webp`) · **Size:** **1920 × 990 px** (or 1746 × 901 to match
  `bg.webp` exactly)
- **Format:** `.webp`
- **Composition rule (important, same for both):** keep the **main subject on the RIGHT half** of
  the frame and the **left third darker / emptier** — the white headline text sits on the left and
  must stay readable over it. Same cinematic teal‑green/night color grade as the current hero so the
  three slides feel like one continuous set, not three different photoshoots.

### `hero-2.webp` — happy customer receiving a branded delivery
Concept: the moment of delivery — a driver hands over a package/card clearly showing the Afri
Logistics logo, and the customer's genuine happy reaction sells the trust of the brand.

> Cinematic photograph of a warm, genuine delivery moment at dusk: a friendly Ethiopian delivery
> driver in a dark uniform with subtle green accents hands over a cardboard parcel to a smiling,
> visibly happy customer at their front door. The parcel has a clean green shipping label/sticker on
> it reading "AFRI LOGISTICS" in a bold modern sans-serif logotype with a small Africa-map icon
> beside the wordmark — the label design should read as a real professional courier label, crisp and
> legible, not decorative. The customer is mid-laugh or smiling broadly, holding the package with
> both hands, natural candid body language, positioned on the right two-thirds of the frame. Soft
> golden porch light mixed with a cool teal-green ambient glow, shallow depth of field with a
> blurred green branded delivery van visible behind them. The left third of the frame is darker,
> softly out-of-focus, and empty of subjects — reserved for text overlay. Photorealistic, editorial
> advertising photography style, high detail, warm and trustworthy mood, no watermark, no extra
> text anywhere in the image except the one small "AFRI LOGISTICS" label on the parcel.

### `hero-3.webp` — live map tracking / "every driver is tracked" trust visual
Concept: not a person or a truck — a live operations map/dashboard glowing with tracked driver
positions, conveying that admin staff can see and trust every single driver in real time.

> A high-tech dark dashboard interface showing a stylized city map of Ethiopia at night, glowing
> with a network of bright green GPS location pins and dotted delivery route lines connecting them,
> each pin representing a different active driver, with two or three pins subtly pulsing like a live
> "online" indicator. A faint green outline of the African continent is worked into the map's
> watermark layer as a subtle brand motif (not readable text, just a graphic silhouette). Sleek
> minimal UI elements — thin glowing borders, small route progress bars, soft green glassmorphism
> panels — float near the pins, dashboard-software aesthetic like a modern logistics command center.
> The map and UI elements are concentrated on the right two-thirds of the frame; the left third fades
> into dark navy/black negative space, softly blurred, for text overlay. Deep navy and teal-green
> color palette matching a premium tech product, crisp glowing highlights, high detail, digital art /
> UI-concept-art style, no readable text or logos anywhere, no watermark.

> After you drop `hero-2.webp` and `hero-3.webp` into `public/`, tell me and I'll rebuild + redeploy
> so they go live (Vite copies `public/` into the container only at build time).

---

## 1. About — primary image
- **File name:** `about-1.webp`
- **Put it in:** `africa-logistic-frontend/public/images/`
- **Aspect ratio:** 4:3  ·  **Target size:** 900 × 675 px
- **Prompt:**
  > Aerial view of a busy Ethiopian shipping port at golden hour, neatly stacked colorful cargo
  > shipping containers, a large cargo ship docked, clean professional logistics photography, warm
  > natural light with subtle green tones, sharp focus, high detail, realistic, no text, no
  > watermark.

## 2. About — secondary image
- **File name:** `about-2.webp`
- **Put it in:** `africa-logistic-frontend/public/images/`
- **Aspect ratio:** 16:8 (2:1)  ·  **Target size:** 900 × 450 px
- **Prompt:**
  > Container cranes loading shipping containers at a modern port terminal at dusk, dramatic sky,
  > cinematic industrial logistics scene, cool tones with green accents, high detail, realistic, no
  > text, no watermark.

## 3. Why Choose Us — feature image
- **File name:** `why-choose.webp`
- **Put it in:** `africa-logistic-frontend/public/images/`
- **Aspect ratio:** 4:5 (portrait)  ·  **Target size:** 760 × 950 px
- **Prompt:**
  > Dynamic composite of global logistics — a cargo airplane flying above stacked shipping
  > containers with a green delivery truck on a highway below, energetic sunset sky, professional
  > marketing image with green brand accents, portrait orientation, high detail, realistic, no text,
  > no watermark.

## 4. Apps band — background texture (OPTIONAL)
- **File name:** `apps-bg.webp`
- **Put it in:** `africa-logistic-frontend/public/images/`
- **Aspect ratio:** 8:3  ·  **Target size:** 1600 × 600 px
- **Note:** Shown at low opacity over a green gradient; if omitted, the plain green gradient is used.
- **Prompt:**
  > Abstract dark green gradient background with faint glowing world-map lines and subtle dotted
  > route/flight paths, minimal and modern logistics theme, very low contrast so overlaid white text
  > stays readable, seamless, high detail, no text, no watermark.

---

## 5. Team photos (OPTIONAL — your REAL staff photos, not AI faces)
Drop each person's real headshot here to replace the initials monogram. If a file is missing, that
card just shows the person's initials on a green gradient (which looks intentional).

- **Put them in:** `africa-logistic-frontend/public/images/team/`
- **Aspect ratio:** 1:1 (square)  ·  **Target size:** 400 × 400 px  ·  **Format:** `.webp`
- **Exact file names:**
  | Person | File name |
  | --- | --- |
  | Eng. Abduljelil Kasim (General Manager) | `abduljelil-kasim.webp` |
  | Eng. Husen Ebrahim (Executive Director) | `husen-ebrahim.webp` |
  | Bilal Reshid (Finance and Administration) | `bilal-reshid.webp` |
  | Fromsa Imad (Fleet Management & Logistics) | `fromsa-imad.webp` |

Tip: crop square, face centered, plain/office background.
