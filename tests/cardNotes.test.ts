import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCardUpdates } from '../src/dataValidation';
import { sameCardContent, cardContentVersion } from '../src/cardConflicts';
import { parseEditorDraft } from '../src/editorDraft';
import { exportDeckAsZip, parseImportDeckFile, sanitizeImportedCard } from '../src/deckArchive';
import { translations } from '../src/translations';
import type { FlashcardData } from '../src/models';

test('notes are optional bounded text, not arbitrary objects or silent truncations', () => {
  assert.deepEqual(validateCardUpdates({note:'Exam topic'}),{note:'Exam topic'});
  assert.deepEqual(validateCardUpdates({note:''}),{note:''});
  assert.throws(()=>validateCardUpdates({note:'x'.repeat(1001)}));
  assert.throws(()=>sanitizeImportedCard({note:'x'.repeat(1001)}));
  assert.throws(()=>validateCardUpdates({note:{text:'wrong'}}));
});
test('note-only edits have recoverable drafts and conflict protection, not scheduling effects', () => {
  assert.equal(parseEditorDraft(JSON.stringify({fields:{note:'Exam topic'},timestamp:Date.now()}))?.fields.note,'Exam topic');
  assert.equal(sameCardContent({note:'old'},{note:'new'}),false);
  assert.equal(sameCardContent({}, {note:''}),true);
  assert.equal(cardContentVersion({frontText:'Q',note:'old'}),cardContentVersion({frontText:'Q',note:'new'}));
});
test('card notes round-trip in shared decks without bringing review history along', async () => {
  const blob=await exportDeckAsZip('Notes',[{id:'one',unitId:'folder',frontText:'Q',backText:'A',note:'Exam could target this topic.\nCheck chapter 4.'} as FlashcardData]);
  const file=new File([await blob.arrayBuffer()],'Notes.zip',{type:'application/zip'});
  const imported=await parseImportDeckFile(file);
  assert.equal(imported.cards[0].note,'Exam could target this topic.\nCheck chapter 4.');
});
test('plain-language labels preserve the existing four rating identifiers', () => {
  assert.deepEqual(['again','hard','good','easy'].map(k=>translations.English[k]),['Forgot','Difficult','Remembered','Easy']);
  assert.equal(translations.English.ankiModeTitle,'Spaced Review');
  assert.equal(translations.Amharic.again,'ረሳሁ');
  assert.ok(!translations.English.ankiUsage.includes('without forgetting'));
});

test('study-mode help stays short and free of scheduler jargon', () => {
  for (const language of ['English','Amharic'] as const) {
    const copy = translations[language] as Record<string, any>;
    for (const key of ['speedRecallHelpDesc','speedRecallUsage','speedRecallFeatures','speedRecallExample','ankiHelpDesc','ankiUsage','ankiFeatures','ankiExample','lockinHelpDesc','lockinUsage','lockinFeatures','lockinExample']) {
      assert.ok(copy[key].length <= 90, `${language}.${key} should stay concise`);
      assert.doesNotMatch(copy[key], /FSRS|SM-2|Pomodoro|Reveal Delay|algorithm/i, `${language}.${key} should avoid jargon`);
    }
  }
});
