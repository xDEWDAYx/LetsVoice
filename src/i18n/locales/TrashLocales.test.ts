import en from './en.json';
import zh from './zh.json';

const locales = { en, zh } as const;
const sharedDialogKeys = ['common.cancel', 'common.confirm'] as const;

describe('Trash interface translations', () => {
  it('keeps the Trash key set complete in both locales', () => {
    const englishTrashKeys = Object.keys(en)
      .filter((key) => key.startsWith('trash.'))
      .sort();
    const chineseTrashKeys = Object.keys(zh)
      .filter((key) => key.startsWith('trash.'))
      .sort();

    expect(englishTrashKeys.length).toBeGreaterThan(0);
    expect(chineseTrashKeys).toEqual(englishTrashKeys);

    Object.values(locales).forEach((locale) => {
      englishTrashKeys.forEach((key) => {
        expect(locale[key as keyof typeof locale]).toEqual(expect.any(String));
        expect(locale[key as keyof typeof locale].trim()).not.toBe('');
      });
    });
  });

  it('translates shared confirmation buttons instead of using fallbacks', () => {
    Object.values(locales).forEach((locale) => {
      sharedDialogKeys.forEach((key) => {
        expect(locale[key]).toEqual(expect.any(String));
        expect(locale[key].trim()).not.toBe('');
      });
    });

    expect(zh['common.cancel']).toBe('取消');
    expect(zh['common.confirm']).toBe('确认');
  });
});
