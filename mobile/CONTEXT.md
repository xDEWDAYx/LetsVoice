# LetsVoice Local Mobile

LetsVoice Local Mobile captures, organises, and explores private speech-derived knowledge while keeping inference on the user's phone.

## Language

**Offline-ready device**:
An iPhone with the required models installed, able to run all core LetsVoice workflows without internet access or a development computer.
_Avoid_: Offline app, disconnected build

**Foreground operation**:
A live transcription, model download, or local AI generation that is guaranteed only while LetsVoice remains visible. Leaving the foreground may stop it, but must preserve prior user content and leave a clear retryable state.
_Avoid_: Background task, resumable background work

**Reference iPhone**:
The iPhone 16 Pro Max running iOS 27 Beta 6 on which complete feature, quality, and performance acceptance is performed.
_Avoid_: Any supported iPhone, test phone

**Compatible iPhone**:
An iPhone running iOS 16.4 or later on which the app is expected to install and operate, without a guarantee that large models meet reference-device performance.
_Avoid_: Reference iPhone, iOS device

**Demonstration build**:
A standalone Release build installed directly on the Reference iPhone with local signing, required models preinstalled, and no dependency on Metro, a development computer, or internet access for core workflows.
_Avoid_: Development build, App Store release

**Model catalog**:
The set of models offered for optional download to a device.
_Avoid_: Model library, model store

**Installed model**:
A model whose complete, validated assets are stored on the device and available for local inference.
_Avoid_: Downloaded model

**Active model**:
The installed model currently selected for a particular local inference capability.
_Avoid_: Default model, enabled model

**User content**:
Recordings, transcripts, notes, workspaces, derived insights, and AI conversations created from a person's activity in LetsVoice.
_Avoid_: App data, model files

**Complete Note PDF**:
An English-labelled temporary export of one Note containing its metadata, original Transcript, latest Structured Note, complete Knowledge result history, and full messages only from Ask AI conversations whose source set contains that Note alone; multi-Note conversations contribute metadata and source count without message content. It preserves the language of User content, references but never embeds recorded audio, opens the iOS share sheet, and leaves no app-maintained export copy.
_Avoid_: Current-section export, embedded audio, translated-content substitution, cross-Note conversation disclosure, persistent export copy

**Trash content**:
A Note, Workspace, Ask AI conversation, or custom Knowledge template removed from ordinary product views but retained on the device until restoration or Permanent deletion.
_Avoid_: Deleted content, archived content, hidden content

**Workspace Trash bundle**:
A trashed Workspace together with the Notes it still owns. Restoring the bundle reveals only Notes that were active when the Workspace was trashed; a Note already in Trash keeps its independent Trash state.
_Avoid_: Cascaded Note deletion, flattened Trash items

**Fallback Workspace**:
A fresh “My Workspace” created only when capture or audio import needs a destination and no active Workspace exists. It never restores or merges a Workspace already in Trash.
_Avoid_: Required Workspace, restored default, permanent default ID

**Workspace name suggestion**:
An English local-rule recommendation shown on Workspaces when none exists or a generic name such as My Workspace can be improved, using recent Note language to suggest a Meeting, Study, Research, Project, or Ideas-oriented name and reason. It never uses an LLM, classifies a Note into a destination, creates, renames, or moves content without explicit confirmation.
_Avoid_: Workspace routing, automatic rename, automatic Note move, LLM suggestion, Chinese suggestion copy

**Workspace search**:
The fixed Workspaces-screen text filter that matches active Workspace names and changes only the visible Workspace list. It never searches Notes, Structured Notes, Knowledge results, or Ask AI conversations.
_Avoid_: Note search, cross-resource search, Workspace routing

**Independent Trash state**:
The rule that a Note or Workspace and an Ask AI conversation linked to it enter Trash only through separate explicit actions. Trashing a source retains both the conversation and its source relationship for possible restoration.
_Avoid_: Cascaded conversation deletion, detached conversation

**Permanent deletion**:
An explicit irreversible action that removes Trash content and any local artifacts owned only by that content.
_Avoid_: Delete, remove, automatic cleanup

**Source erasure cascade**:
The Permanent deletion of a Note or Workspace together with every Ask AI conversation whose locked source set includes an affected Note, even when that conversation also has unaffected sources.
_Avoid_: Detached source, orphaned conversation, partial conversation retention

**Safe-area modal**:
Any custom blocking overlay for editing, selection, or browsing that is centred inside the visible iOS safe area and scrolls internally when its content is taller than the available space. Tapping its backdrop follows the same cancellation path as its close control while idle; it does nothing during an in-flight save or operation, and any unsaved recording result still requires discard confirmation. Destructive native system confirmations retain the standard iOS dismissal rules. Android presentation remains platform-specific.
_Avoid_: Top sheet, status-bar overlay, raw modal, silent recording loss, busy-state dismissal

**Editor modal**:
A Safe-area modal used for a focused create, rename, or save interaction that accepts typed User content and avoids the software keyboard. Closing it through its backdrop or close control preserves the unfinished draft for the next opening; only a successful save clears that draft.
_Avoid_: Picker sheet, selection modal, any popup, close-to-discard editor

**Model artifact**:
A non-user-authored file obtained from a model supplier and stored on the device for local inference.
_Avoid_: User content, cloud model

**Model download**:
A user-initiated transfer of a model artifact over Wi-Fi or cellular data. The model size is visible before the action, and cellular use does not require an additional confirmation.
_Avoid_: Automatic download, Wi-Fi-only download

**Storage-safe operation**:
A model download, audio import, or live transcription that starts only with sufficient free space and never deletes user content or model artifacts automatically to make room.
_Avoid_: Automatic cleanup, storage reclamation

**Platform parity**:
The iPhone app exposes the same product workflows as the current Android main branch, while allowing platform-appropriate presentation and interaction details.
_Avoid_: Identical UI, feature expansion

**iOS feature batch**:
A bounded set of existing LetsVoice Local desktop capabilities selected for iPhone-only delivery. It does not require Android parity or imply complete desktop parity.
_Avoid_: Platform parity, desktop parity, Android parity

**iPhone interface language**:
The iPhone app exposes only English interface text and no interface-language picker. Transcripts, imported audio, user-authored content, and local AI output may still use supported non-English languages without creating a translated iPhone interface.
_Avoid_: Multilingual iPhone interface, Chinese UI, interface language scope

**Reference model profile**:
The nominated STT, LLM, and TTS model combination used for full end-to-end, quality, and performance acceptance on the reference iPhone. Other catalog models remain supported and receive capability-appropriate smoke testing.
_Avoid_: Default models, only supported models

**Supported audio import**:
A WAV, MP3, M4A/AAC, or FLAC file no longer than two hours and no larger than 2 GB, accepted for local preparation and transcription. Inputs outside these format or size limits must be rejected without disturbing saved user data.
_Avoid_: Any audio file, uploaded audio

**Live transcription session**:
A foreground microphone capture and incremental local transcription session lasting no more than two hours. Backgrounding, phone locking, or an audio interruption pauses it while preserving captured content; only the user may resume it, and at the time limit it ends safely for the user to save or discard.
_Avoid_: Background recording, unlimited recording

**Responsive live transcription**:
On the Reference iPhone with the reference STT model, recording starts within 10 seconds, the first readable text and later updates appear within 15-second intervals, and finalisation completes within 30 seconds.
_Avoid_: Instant transcription, zero-latency transcription

**Reference audio input**:
The Reference iPhone's built-in microphone, which must satisfy the full live transcription acceptance criteria. External, Bluetooth, and USB microphones are best-effort compatible inputs.
_Avoid_: Any available microphone, AirPods support

**Reference transcription language**:
English transcription through the reference Parakeet model, subject to the complete live and imported-audio acceptance criteria.
_Avoid_: Any supported language, Chinese baseline

**Chinese compatibility transcription**:
Live and imported-audio transcription through the full-precision multilingual Whisper small model on both iPhone and Android, expected to produce basically readable Chinese without the Reference transcription language's hard latency guarantees. This compatibility path is added only after base iPhone platform parity is complete.
_Avoid_: Chinese reference transcription, Parakeet Chinese

**Chinese compatibility sample**:
A fixed one-to-two-minute Mandarin sample supplied by the project group, containing ordinary speech and some graduation-project terminology with ten agreed key information points. Both live and imported-audio transcription pass when at least eight key points retain their meaning, no fabricated key point changes the meaning, the result can be saved, and the app neither crashes nor becomes unusably stuck; no hard completion-time target applies.
_Avoid_: Chinese benchmark, word-error-rate test

**Responsive Ask AI**:
On the Reference iPhone with the reference LLM, a single grounded question over a note of up to roughly 1,500 words completes from a cold start within 90 seconds, and a stop request settles within three seconds without freezing ordinary navigation.
_Avoid_: Cloud-speed response, unrestricted context

**Ask AI generation deadline**:
The 90-second hard limit covering queueing, model preparation, generation, and saving after a question is accepted. Expiry or Stop interrupts native generation within three seconds, preserves the unanswered user message, discards partial assistant output, and presents a retryable state.
_Avoid_: Soft warning, unlimited wait, discarded timeout question

**Ask AI source set**:
The locked set of one to three selected Notes whose transcripts form the only evidence corpus for an AI conversation. Structured Notes, Knowledge documents, unselected Notes, and workspace-wide context remain excluded.
_Avoid_: Workspace context, combined knowledge context, mutable sources

**Multi-note evidence selection**:
Local keyword and fuzzy ranking over transcript chunks from the complete Ask AI source set, with evidence balanced across Notes for broad questions. It uses no embedding model and returns a clearly qualified best-effort answer from evidence that fits the prompt rather than refusing solely because the source set is large.
_Avoid_: Semantic search, silent whole-Note truncation, size-only refusal

**Ask AI language pair**:
A same-language Note, user question, and assistant answer in either English or Mandarin Chinese. English must pass full acceptance, Mandarin Chinese provides a compatibility test path, and cross-language retrieval or translation is outside scope.
_Avoid_: Translated answer, cross-language search, multilingual UI

**Ask AI resume target**:
The most recently updated saved conversation whose locked source set exactly matches the source set used to enter Ask AI, treating Note order as irrelevant. A single-Note entry never resumes a conversation containing additional Notes, and a multi-select entry never resumes a partially overlapping conversation. When no exact match exists the app creates one; the explicit New action always starts another empty conversation with the same locked source set.
_Avoid_: Unsaved screen state, always-new chat, workspace-wide latest chat, implicit multi-Note resume, partial source match

**Linked conversation list**:
The newest-first Note-detail list of every active Ask AI conversation whose locked source set contains that Note, showing its name, update time, latest-message preview, and source count. Opening an entry preserves its complete source set, unavailable-source conversations remain readable but not writable, trashed conversations stay in Trash, and a separate action starts a new single-Note conversation.
_Avoid_: Exact-source-only list, silently reduced context, trashed conversation row, implicit new conversation

**Ask AI generation session**:
A foreground local LLM operation that may continue after in-app navigation and saves its completed reply to the conversation. Backgrounding or locking stops it while preserving the unanswered user message for retry.
_Avoid_: Screen-owned request, background inference, discarded question

**Ask AI progress stage**:
A truthful current state shown with an activity spinner as Preparing note context, Waiting for local AI, Loading model, Generating answer, Saving answer, or Stopping, skipping stages that do not occur. It exposes no invented percentage, artificial delay, or separate answer-checking claim, and disables duplicate submission while active.
_Avoid_: Fake progress, forced stage delay, checking-answer stage, generic frozen loading state

**Unavailable-source conversation**:
A saved Ask AI conversation for which at least one locked source is in Trash. Its history remains readable, but no question, retry, or generation may continue until every locked source is restored.
_Avoid_: Partial-context conversation, hidden conversation, broken conversation

**Grounded follow-up**:
A question interpreted using the saved history of its Ask AI conversation, including pronouns and omitted subjects, while every factual answer remains supported by the Ask AI source set. Irrelevant older turns may be excluded from the model prompt to preserve responsiveness.
_Avoid_: Independent question, unrestricted chat memory, history as evidence

**Grounded answer**:
A reply produced from verified transcript evidence selected across the complete Ask AI source set, then checked so its factual claims remain supported by that evidence. When prompt limits prevent complete broad coverage, it identifies the answer concisely as best-effort rather than presenting it as exhaustive. The chat UI stays minimal and does not add source-note lists, source chips, or sentence-level citations.
_Avoid_: Classifier-approved answer, general-knowledge answer, unverified model reply, source panel

**Rendered AI answer**:
An Ask AI assistant reply displayed as readable native iPhone text whose supported Markdown markers become headings, emphasis, lists, quotes, or code rather than remaining visible syntax; incomplete or unsupported markup degrades to ordinary readable text. It executes no HTML or code, loads no remote images, and opens only user-confirmed HTTPS links outside the app, while speech uses its marker-free natural text.
_Avoid_: Raw Markdown answer, executable markup, WebView answer, remote answer image, spoken Markdown syntax

**Grounding refusal**:
An Ask AI reply stating that the complete Ask AI source set contains no relevant evidence after local evidence selection. Source size alone never causes this refusal, and the reply never fills an evidence gap with pretrained knowledge, speculation, or an unlabeled guess.
_Avoid_: General-knowledge answer, best-effort guess, fabricated completion

**Structured Note**:
A locally derived summary, key points, tasks, reminders, and calendar intents for a note whose queued, model-preparation, generation, and save work has a 180-second hard deadline. Expiry or Stop settles native generation within three seconds, retains any previous Structured Note or no result for a first attempt, and offers Retry without changing the source Note.
_Avoid_: CoreNoteInsight, AI analysis

**Automatic Structured Note review**:
The foreground post-capture workflow that first saves a newly recorded or imported Note, then automatically generates its Structured Note when an Active model is available and opens the result for review. Missing models, failure, timeout, or backgrounding preserve the Note in a retryable state, while later transcript edits make the existing result stale and require explicit regeneration.
_Avoid_: Pre-save generation, save-blocking generation, automatic regeneration after transcript edit

**Knowledge document**:
A locally generated, scenario-specific extraction of information from a note whose queued, model-preparation, generation, and save work has a 120-second hard deadline. Expiry or Stop settles native generation within three seconds and creates no Knowledge result snapshot, preserving every existing result for Retry.
_Avoid_: Structured Note, generic summary

**Custom Knowledge template**:
A saved user-created reusable definition containing two to eight named sections and their extraction guidance for a Knowledge document. It is created or edited from a short name and natural-language requirement after the local model proposes a structure and the user reviews it. Saving an edit affects only future generation; the first iOS version exposes no template revision history or rollback.
_Avoid_: Built-in Knowledge scenario, raw prompt, Knowledge document, unreviewed model output, versioned template

**Knowledge template manager**:
The single full-screen custom-template management surface reached either from AI Management or from the shortcut beneath a Note's Knowledge template picker. Both entrances open the same list and create, edit, or Trash flow rather than separate modal implementations. The six application-maintained built-in scenarios remain read-only and outside this CRUD list; the Note picker displays Built-in and Custom groups separately.
_Avoid_: Template dialog, per-Note template settings, duplicated manager, editable built-in scenario

**Knowledge template draft**:
An unsaved custom-template structure proposed locally from the user's natural-language requirement or started manually with two empty sections when no model is available or draft generation fails. Before saving, the user may rename sections, edit their extraction guidance, add sections, or remove sections while retaining between two and eight valid sections; failed generation preserves the entered name and requirement and offers both Retry and Build Manually.
_Avoid_: Saved template, generated Knowledge document, opaque prompt, model-required template

**Knowledge result snapshot**:
A saved immutable Knowledge document that retains the built-in scenario or custom template name and section structure used when it was generated. Every successful generation creates a new snapshot; later template edits and regenerations never rewrite it, and a custom-template result remains part of its Note after that template enters Trash or is permanently deleted.
_Avoid_: Live template output, template-owned result, orphaned output, retroactively updated result, overwritten result

**Knowledge result history**:
All successful Knowledge result snapshots belonging to a Note, whether generated from a built-in scenario or a custom template, ordered newest first. The newest result is expanded initially and older results are collapsed; failed or cancelled attempts are not history entries. A user may permanently delete one snapshot after confirmation, but result snapshots do not enter Trash and have no batch deletion or restoration; permanently deleting the owning Note removes its complete history.
_Avoid_: Template history, generation log, latest-only result, trashed result, recoverable result deletion

**Speakable AI output**:
An Ask AI assistant reply, Structured Note, or Knowledge document that the user may play through local text-to-speech. User questions, raw transcripts, and interface text are outside this scope.
_Avoid_: Any text, transcript narration, screen reader content

**Automatic answer speech**:
The default-off preference that speaks only a newly completed Ask AI assistant reply when an Active TTS model is available. It never replays history or downloads a model, reads natural rendered text without Markdown syntax, and stops for user cancellation, backgrounding, locking, transcription, or another local LLM operation without affecting the saved answer.
_Avoid_: Automatic history playback, automatic TTS download, Markdown narration, required speech

**Speech playback session**:
The single app-wide text-to-speech playback owned by one Speakable AI output. It preserves its position while paused so the same output can resume, while starting another output ends the current session so spoken audio never overlaps. Backgrounding or locking pauses it, and returning to the foreground requires the user to resume it explicitly.
_Avoid_: Per-screen player, concurrent narration

**Progressive speech playback**:
A Speech playback session that starts after its first natural-language chunk is ready and prepares later chunks while earlier audio plays. Pausing retains the current audio position and prepared queue, lets only an already-running synthesis finish, and defers new chunk synthesis until resumption.
_Avoid_: Whole-output generation, restart-on-resume playback

**Speech playback profile**:
The Active model's default speaker at normal speed used by every Speech playback session in this iOS feature batch. Voice selection and speed adjustment are outside the batch.
_Avoid_: Voice preset, playback settings, per-output voice

**Speech playback cache**:
Temporary generated speech audio retained only for an active or paused Speech playback session. It is removed when playback finishes, is cancelled or replaced, and during the next app startup; it is never a saved recording or export.
_Avoid_: Recording, generated media library, persistent narration

**Responsive speech playback**:
On the Reference iPhone with the Active model already installed, a Speakable AI output begins speaking within 10 seconds, pause, resume, and replacement respond within one second, and an output of roughly 1,500 words plays progressively without a crash or loss of the paused position.
_Avoid_: Instant speech, model-download time, whole-output latency

**Local inference exclusivity**:
The rule that transcription, local LLM generation, and a Speech playback session do not run concurrently in this iOS feature batch. Starting transcription or LLM generation ends playback and clears its cache, and TTS remains unavailable until the other operation finishes.
_Avoid_: Concurrent model inference, automatic narration resumption

**Theme preference**:
The persisted choice of Light, Dark, or System appearance for the entire app. Light is the default until the user explicitly selects another value, and System tracks iOS appearance changes across every visible surface while the app runs.
_Avoid_: Color scheme, per-screen theme, automatic dark default

**Text size preference**:
The persisted Small, Default, or Large iPhone text scale, applying approximately 90%, 100%, or 115% to application typography while retaining iOS Dynamic Type. Long-form Transcript and AI content may scale and wrap more freely, while controls preserve accessible touch targets and icons remain visually stable.
_Avoid_: Fixed-only text size, disabled Dynamic Type, scaled touch target, icon-size preference

**Theme-ready launch**:
An app launch whose first visible surface already uses the resolved Theme preference. The splash remains until resolution completes, and a read failure falls back to Light rather than exposing an intermediate theme flash.
_Avoid_: Post-render theme switch, light-mode flash

**Home**:
The iPhone app's primary screen for starting transcription and reviewing the note, task, and calendar overview. It is the sole dashboard surface rather than a gateway to a separate Dashboard page.
_Avoid_: Dashboard page, overview tab, capture-only home

**Home Calendar item**:
A pending top-level Task, explicit Reminder, or Calendar Event shown on its local date, or a transcript-date fallback shown only when the same Note and date have no Structured Note item. Fallback recognition accepts explicit English, Chinese, and ISO dates plus same-sentence contextual today, tomorrow, day-after-tomorrow, and weekday expressions, uses nearby source text with a From transcript label, excludes non-specific periods, and never creates a notification.
_Avoid_: Duplicate fallback, unconstrained date mention, inferred notification, calendar-only Structured Note item

**Trash settings entry**:
The Settings row that opens the unified Trash screen. It uses the same outlined Trash2 wastebasket visual as the desktop Trash setting rather than an archive, generic X, or model-delete icon.
_Avoid_: Trash tab, Library Trash, archive icon

**Getting Started guide**:
A four-step, skippable first-launch introduction to local privacy, recording and import, actual STT/LLM/TTS setup status, and entry to Home, which never downloads a model or requests a system permission by itself. Completing or skipping suppresses automatic presentation, while Settings can reopen the same guide and unavailable model-dependent features provide direct Setup actions.
_Avoid_: Mandatory onboarding, automatic model download, onboarding permission prompt, one-time-only guide

**Trash browser**:
The full-screen Settings destination that lists Trash content newest first, supports text search and filters for All, Notes, Workspaces, Ask AI, and Templates, and offers per-item Restore and Permanent deletion. Its first iOS version has no selection mode, bulk restore, bulk Permanent deletion, or empty-all action.
_Avoid_: Trash modal, automatic purge, empty Trash, Trash batch action

**Trash undo window**:
The five-second bottom notice shown after one explicit move-to-Trash operation. Undo restores the entire operation atomically, including all Notes in a batch; expiry only dismisses the notice because the content remains recoverable in Trash. Permanent deletion has confirmation instead and is never undoable.
_Avoid_: Delayed deletion, per-item batch undo, permanent-delete undo

**Note selection mode**:
A temporary multi-select state available in a Workspace detail or global Note search result, but not on Home. On entry it freezes the current query, category, and other list filters so every selected Note remains visible; the user may continue selecting within that fixed result set, Select All or Deselect All, or Cancel, but cannot accumulate hidden selections across searches. Deselecting the final Note exits the mode. It supports cross-Workspace batch actions without changing ordinary Note navigation.
_Avoid_: Home selection, permanent selection, Workspace selection, hidden selection, cross-query selection

**Batch Note action**:
One move, Trash, pin-state, or Ask AI action applied atomically to the Notes in Note selection mode. Move, Trash, and pin-state actions may include any number of Notes, while Ask AI accepts one to three: selecting more keeps its action visible but disabled with Select up to 3 notes and never silently truncates the source set. A cross-Workspace Move targets one existing active Workspace, treats selected Notes already there as no-ops, moves every other Note in one transaction, preserves all Note-owned content and relationships through stable IDs, and exits selection only after success; it never creates a Workspace inside the picker. Batch pin shows Unpin All only when every selected Note is pinned and otherwise shows Pin All, so a mixed selection becomes uniformly pinned rather than inverted; pin-state changes never request reclassification.
_Avoid_: Repeated single-Note action, bulk Workspace action, partial batch success, inline Workspace creation

**Note category**:
One language-independent classification key assigned to a Note: meeting, personal, idea, learning, general, or uncategorized. The first five describe the Note's dominant purpose; uncategorized represents no successful assignment or an explicit reset, and the first iOS version has no user-defined category CRUD.
_Avoid_: Tag, Workspace, custom category, translated database value

**Category filter**:
A reusable horizontal All, Meeting, Personal, Idea, Learning, General, and Uncategorized selector shown above Note lists on Home, Workspace detail, and global search. It combines with that surface's pinned, open-task, and text-query conditions, changes only the visible list, and never mutates Note categories; every Note card also displays its current category badge.
_Avoid_: Category navigation, exclusive filter mode, hidden Note category

**Category chooser**:
The bottom selection surface opened by tapping the category badge in Note detail. It immediately saves one fixed category, resets to Uncategorized, or requests Classify Automatically; category badges on list cards are display-only so they do not conflict with Note opening or long-press selection.
_Avoid_: Card category action, category editor, delayed category save

**Fuzzy Note search corpus**:
The on-device searchable text owned by an active Note: its title, complete transcript, category display name, Structured Note summary, key points and Task text, plus section names and content from built-in and custom Knowledge result history. Trash content and Ask AI questions or replies are excluded so generated conversational wording cannot create misleading Note matches.
_Avoid_: Embedding index, Ask AI corpus, Trash search, title-only search

**Fuzzy Note match**:
A deterministic result ranked by title phrase, all title terms, phrase in other Note-owned content, all query terms across that Note, and finally bounded character-edit tolerance. Short terms permit at most one edit and longer terms at most two; Chinese uses character fragments plus the same bounded tolerance. Ties prefer pinned Notes and then recent updates, and the live search refreshes after roughly 200 milliseconds without a similarity percentage.
_Avoid_: Vector similarity, unbounded fuzzy match, single-term OR search, similarity score

**Search match preview**:
The single highest-ranked excerpt shown on a Note search result with query highlighting and a compact Title, Transcript, Structured Note, or Knowledge source label. Opening it selects the matching Transcript or Insights section, or expands the matching Knowledge result snapshot; title and category matches use ordinary Note opening.
_Avoid_: Multiple result excerpts, similarity explanation, unrelated transcript preview

**Automatic Note classification**:
The default post-save local-LLM operation that starts immediately after a new or transcript-edited Note has been persisted, without delaying that save. Its successful result has priority over any earlier manual category; only transcript content changes trigger it, while rename, move, pin, and other metadata changes do not. Failure leaves the current category unchanged, or uncategorized when none exists. Because this is a development build, pre-existing uncategorized Notes are not backfilled automatically.
_Avoid_: Save-blocking classification, manual-priority category, metadata reclassification, historical classification queue

**Task**:
A top-level actionable item generated as part of a Structured Note whose completion and pin states the user can change from Home or the source note. Home does not create, edit, or delete Tasks; it links to the source note for context, and nested or unassigned action items remain supporting detail rather than independent Tasks in this iOS feature batch.
_Avoid_: To-do record, action item, reminder

**Notification opt-in**:
The persisted iPhone preference that starts disabled and requests iOS notification permission only when the user enables Task & Reminder Notifications in Settings. A denial leaves every non-notification workflow available and gives the user a route to the system settings instead of prompting during launch or Structured Note generation.
_Avoid_: Automatic permission prompt, required notification access, first-launch notification request

**Scheduled Note notification**:
A local iOS alert owned by a source Note for either an explicit future Reminder at its remind time or the current pending occurrence of a top-level Task at its due time; opening it navigates to the source Note, while completion, Trash, regeneration, and time changes cancel or reschedule it. Date-only items alert at 09:00 in the device's current time zone, past times never produce catch-up alerts, and Calendar-only events, nested action items, and raw transcript date fallbacks never alert.
_Avoid_: Calendar event alert, action-item alert, raw-date alert, detached notification

**Recurring Task rule**:
A daily, weekdays, weekly, biweekly, or monthly schedule extracted for a Task only when the Note transcript contains an explicit matching English or Chinese recurrence expression. Deterministic date rewriting establishes the first occurrence and rule before local-model extraction; unsupported custom intervals and inferred repetition remain one-off Tasks.
_Avoid_: Custom recurrence, guessed recurrence, model-calculated dates, manually authored recurrence

**Recurring Task series**:
The persisted source identity, fixed Recurring Task rule, series-level pin state, and occurrence history for one extracted recurring commitment. Its regeneration identity is the source Note, normalized title, recurrence kind, and schedule parameter. An exact match preserves history, current occurrence, and pin state; a missing or changed rule ends the old series, removes its pending occurrence from Home, retains completed history in the source Note, and creates a separate series when applicable. It otherwise exposes only its nearest pending occurrence; completing that occurrence retains it in Completed and materializes the first valid occurrence strictly after the completion time. Missed schedule dates create no records, a monthly day absent from a month is skipped rather than shifted, and every successor inherits the series pin state. Permanent deletion of the source Note removes active and ended series with their histories.
_Avoid_: Expanded recurrence rows, fixed recurrence horizon, catch-up backlog, shifted monthly date, fuzzy state transfer, deleted ended-series history, unrelated same-title Tasks

**Ended Recurring Task series**:
A recurring series no longer present with the same rule after Structured Note regeneration. It has no pending Home occurrence and never advances, but its completed occurrences remain readable in the source Note until that Note is permanently deleted.
_Avoid_: Deleted series, active recurrence, paused pending Task

**Task occurrence**:
One dated Task instance belonging to a Recurring Task series. At most one occurrence in a series is pending at a time, while completed occurrences remain individually identifiable in Task history. Only the most recently completed occurrence may be restored: restoration removes its still-pending generated successor and reopens it, while older completed occurrences remain read-only.
_Avoid_: Recurrence rule, duplicate Task, virtual calendar marker, multiple pending occurrences, restored old occurrence

**Home Task List**:
The actionable Task collection on Home, grouped as Overdue, Today, Upcoming, or Unscheduled using the due time first and start time second in the device time zone. Pinned Tasks sort first only within their time group; pending Tasks are expanded. Completed Tasks are collapsed initially, ordered by completion time descending, and revealed twenty at a time through Show older without deleting history; cancelled and complete per-Note history, including Ended Recurring Task series, remain visible in their source notes.
_Avoid_: Note filter, calendar agenda, all insight items, unbounded completed render, automatic task-history purge

**Task identity**:
The normalized title plus effective date that identifies an equivalent generated one-off Task across Structured Note regeneration. An exact match preserves user-set completion and pin states, while a changed or missing value represents a new or removed Task; fuzzy similarity never establishes identity.
_Avoid_: Generated row ID, fuzzy task match, title-only match
