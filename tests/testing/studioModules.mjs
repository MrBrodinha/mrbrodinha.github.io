import { composerUrl, musicUrl, victoryUrl, sourceUrl, scoreUrl, parserUrl, codeUrl, modelUrl } from './sheetEditorModules.mjs';
export const libraryUrl = await sourceUrl('src/components/brodle/lib/melodyLibrary.ts', { './musicGame': musicUrl, './victoryMusic': victoryUrl, '../creator/melodyComposer': composerUrl });
export const studioUrl = await sourceUrl('src/components/testing/sheet-editor/studioDocument.ts', {
  '../../brodle/lib/melodyLibrary': libraryUrl, '../../brodle/lib/musicGame': musicUrl, '../../brodle/lib/victoryMusic': victoryUrl,
  './scoreModel': scoreUrl, './sheetEditorCodeParser': parserUrl, './sheetEditorCode': codeUrl, './sheetEditorModel': modelUrl,
});
export const studio = await import(studioUrl);
