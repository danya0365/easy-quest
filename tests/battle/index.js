// tests/battle/index.js — lets `node --test tests/battle` run the whole battle suite (Node resolves the
// directory to this file). Each *.test.mjs also runs on its own: `node --test tests/battle/*.test.mjs`.
import './formulas.test.mjs';
import './battle.test.mjs';
import './tactics.test.mjs';
