# Deterministic matching

Metadata is extracted from Telegram audio fields or a conservative filename parser. Original values are retained. Missing/ambiguous metadata enters a correction conversation; only one active metadata conversation exists per owner.

Normalization uses NFKD, combining-mark removal, lowercase, common Arabic/Persian character variants, punctuation/whitespace collapse, and narrow filename noise rules. It preserves recording labels. There is no audio fingerprinting, language-model call, alias database, or general cross-script transliteration.

Similarity takes the maximum of normalized and token-sort Levenshtein similarity. Two rolling rows bound memory. Common prefix/suffix trimming keeps the original denominator. Per-submission caches reuse normalized profiles, symmetric distance pairs, artists, and unchanged candidates across searches. Full artist collections, bidirectional coverage, and supported featuring separators matter.

Default title/artist/duration weights are 0.50/0.35/0.15; missing components are omitted and remaining weights renormalized. Duration uses 2/5/10/20-second cutoffs and caps large relative differences. Scores measure string similarity, not probability. Live, acoustic, remaster, edit, extended, instrumental, remix, cover, demo, mono/stereo, and numbered-part differences block automatic selection. Equivalent releases require the same ISRC, normalized title, whole artist collection, compatible versions, and duration within two seconds.

Automatic selection requires the highest-ranked candidate, score ≥80, title ≥85, artist ≥75, distinct-recording margin ≥8, explicit availability true, compatible version, automatic mode enabled, and an owned captured playlist. Below 60 is unmatched; other failures require review. Early search exit additionally requires an automatic decision and score ≥95. Unknown availability is not treated as true or false; automatic addition is blocked and manual processing fails closed unless explicit availability is established.

## Computational limits

At most four search queries and 40 distinct IDs are considered. The ranker bounds each normalized value to 256 UTF-16 units, artist collections to 16 parts, normalization profiles and distance comparisons to 256 each, and dynamic-programming work to 65,536 cells per submission. A single edit-distance comparison is O(mn) time with rolling-row space; per-submission budgets bound aggregate work. Once a budget is exhausted, candidates are marked computationLimited and automatic selection is forbidden, even if an already-scored candidate is perfect. Progressive searching stops. This preserves safety rather than pretending that partial evaluation is complete.

The 64-scenario synthetic dataset in tests/fixtures/evaluation.ts includes positives and adversarial negatives. Zero incorrect automatic selections on this fixture set is a regression result, not a claim of general accuracy. [Measurements](performance.md) and [case study](engineering-case-study.md) explain the limits.
