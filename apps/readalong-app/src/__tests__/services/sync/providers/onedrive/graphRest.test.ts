// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  childrenUrl,
  contentUrl,
  deleteItemUrl,
  encodeGraphPath,
  itemUrl,
  meUrl,
  uploadSessionUrl,
} from '@/services/sync/providers/onedrive/graphRest';

const APPROOT = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';

describe('graphRest', () => {
  test('encodeGraphPath strips slashes and encodes each segment', () => {
    expect(encodeGraphPath('/Readalong/books/a b/config.json')).toBe(
      'Readalong/books/a%20b/config.json',
    );
    expect(encodeGraphPath('/')).toBe('');
  });

  test('itemUrl addresses by path with a $select', () => {
    expect(itemUrl('/Readalong/x.json', 'size,cTag,file')).toBe(
      `${APPROOT}:/Readalong/x.json?$select=size,cTag,file`,
    );
  });

  test('contentUrl targets the content endpoint', () => {
    expect(contentUrl('/Readalong/x.json')).toBe(`${APPROOT}:/Readalong/x.json:/content`);
  });

  test('childrenUrl of a nested path uses the colon form; root uses no colon', () => {
    expect(childrenUrl('/Readalong/books')).toBe(
      `${APPROOT}:/Readalong/books:/children?$select=name,size,cTag,file,folder&$top=200`,
    );
    expect(childrenUrl('/')).toBe(
      `${APPROOT}/children?$select=name,size,cTag,file,folder&$top=200`,
    );
  });

  test('deleteItemUrl + uploadSessionUrl + meUrl', () => {
    expect(deleteItemUrl('/Readalong/x')).toBe(`${APPROOT}:/Readalong/x`);
    expect(uploadSessionUrl('/Readalong/b.epub')).toBe(
      `${APPROOT}:/Readalong/b.epub:/createUploadSession`,
    );
    expect(meUrl()).toBe(
      'https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail,displayName',
    );
  });
});
