export async function resolvePublicImageUrl(imageUrl: string | null) {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    if (url.hostname === 'i.imgur.com') return imageUrl;

    if (url.hostname === 'imgur.com' || url.hostname === 'www.imgur.com') {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length === 1 && /^[a-zA-Z0-9]+(?:\.(?:jpe?g|png|gif|webp))?$/i.test(segments[0])) {
        const imageName = segments[0].includes('.') ? segments[0] : `${segments[0]}.jpg`;
        return `https://i.imgur.com/${imageName}`;
      }

      if (segments.length === 2 && ['a', 'gallery'].includes(segments[0]) && /^[a-zA-Z0-9]+$/.test(segments[1])) {
        const response = await fetch(`https://imgur.com/${segments.join('/')}`, {
          signal: AbortSignal.timeout(4000),
          next: { revalidate: 3600 },
        });
        if (!response.ok) return null;

        const html = await response.text();
        const imageMeta = (html.match(/<meta\b[^>]*>/gi) ?? []).find((tag) =>
          /(?:property|name)=["'](?:og:image|twitter:image)["']/i.test(tag),
        );
        const imageContent = imageMeta?.match(/\bcontent=["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, '&');
        if (!imageContent) return null;

        const thumbnailUrl = new URL(imageContent, 'https://imgur.com');
        return thumbnailUrl.hostname === 'i.imgur.com' ? thumbnailUrl.href : null;
      }

      return null;
    }

    return url.protocol === 'http:' || url.protocol === 'https:' ? imageUrl : null;
  } catch {
    return null;
  }
}