// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDeviceLinkDeepLink } from '@/utils/deeplink';

// A CrossPoint reader's sign-in code is approved on the /link page. A phone
// browser opening that page is usually not signed in to Readalong, and on iOS a
// social sign-in there finishes in the app (/auth/* is a Universal Link), so
// the page opens in the app, which is already signed in.
describe('parseDeviceLinkDeepLink', () => {
  it('parses the web link the reader’s Readalong card opens', () => {
    expect(parseDeviceLinkDeepLink('https://web.readalong.invalid/link?code=RQGF-WDCF')).toEqual({
      code: 'RQGF-WDCF',
    });
  });

  it('parses the custom-scheme link the web page offers', () => {
    expect(parseDeviceLinkDeepLink('readalong://link?code=RQGF-WDCF')).toEqual({
      code: 'RQGF-WDCF',
    });
  });

  it('keeps a link without a code, for the user to type it in', () => {
    expect(parseDeviceLinkDeepLink('https://web.readalong.invalid/link')).toEqual({ code: '' });
  });

  it('rejects other pages and other hosts', () => {
    for (const url of [
      'https://web.readalong.invalid/linked?code=RQGF-WDCF',
      'https://web.readalong.invalid/o/link?code=RQGF-WDCF',
      'https://example.com/link?code=RQGF-WDCF',
      'readalong://book/abc123',
      'not a url',
    ]) {
      expect(parseDeviceLinkDeepLink(url)).toBeNull();
    }
  });

  it('is a Universal Link on iOS, so tapping it opens the app', () => {
    const aasa = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../public/.well-known/apple-app-site-association'),
        'utf8',
      ),
    ) as { applinks: { details: { components: { '/': string }[] }[] } };
    const paths = aasa.applinks.details.flatMap((d) => d.components.map((c) => c['/']));
    expect(paths).toContain('/link');
  });
});
