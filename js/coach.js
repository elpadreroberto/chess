/* Coach: rival visible, sparring con libro, repertorio, PGN, FSRS, Hoy, Qwen local. */
(function (root) {
    const C = root.Coach = root.Coach || {};

    const KEY = {
        rival: 'chess.rivalLevel',
        persona: 'chess.bookPersonality',
        clock: 'chess.clockMode',
        repertoire: 'chess.repertoire',
        deviations: 'chess.deviations',
        fsrs: 'chess.fsrs',
        stats: 'chess.stats',
        lichessToken: 'chess.lichessToken',
        lichessUser: 'chess.lichessUser',
        chesscomUser: 'chess.chesscomUser'
    };

    C.LEVELS = [
        { id: 'torpe', name: 'Torpe', short: 'T', skill: 0, depth: 1, movetime: 90, elo: 1350, limit: true, blunder: 0.52, blunderChance: 0.52, multipv: 4, pick: 'worst' },
        { id: 'basico', name: 'Básico', short: 'B', skill: 2, depth: 3, movetime: 160, elo: 1400, limit: true, blunder: 0.16, blunderChance: 0.16, multipv: 3, pick: 'soft' },
        { id: 'medio', name: 'Medio', short: 'M', skill: 8, depth: 8, movetime: 420, elo: 1750, limit: true, blunder: 0.04, blunderChance: 0.04, multipv: 2, pick: 'bestish' },
        { id: 'avanzado', name: 'Avanzado', short: 'A', skill: 20, depth: 16, movetime: 1100, elo: 0, limit: false, blunder: 0, blunderChance: 0, multipv: 1, pick: 'best' }
    ];

    C.CLOCKS = [
        { id: 'off', name: 'Consulta', base: 0, inc: 0 },
        { id: 'club', name: 'Club 5+3', base: 5 * 60, inc: 3 },
        { id: 'blitz', name: 'Blitz 3+2', base: 3 * 60, inc: 2 }
    ];

    C.PERSONAS = [
        { id: 'fiel', name: 'Libro fiel' },
        { id: 'club', name: 'Club' },
        { id: 'trampas', name: 'Trampas' }
    ];

    function storeGet(k, fallback) {
        try {
            const raw = localStorage.getItem(k);
            if (raw == null) return fallback;
            return JSON.parse(raw);
        } catch (_) {
            return fallback;
        }
    }
    function storeSet(k, v) {
        try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {}
    }
    function storeRawGet(k) {
        try { return localStorage.getItem(k); } catch (_) { return null; }
    }
    function storeRawSet(k, v) {
        try { localStorage.setItem(k, v); } catch (_) {}
    }

    function $(id) { return document.getElementById(id); }

    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ───────── FEN / libro ───────── */
    function fenKey(fen) {
        if (!fen) return '';
        return fen.split(' ').slice(0, 4).join(' ');
    }

    function tryPlay(game, mv) {
        if (!game || !mv) return null;
        if (mv.from && mv.to && typeof mv.from === 'string') {
            const m = game.move({ from: mv.from, to: mv.to, promotion: mv.promotion || 'q' });
            if (m) return m;
        }
        if (Array.isArray(mv.from) && Array.isArray(mv.to) && typeof rcToAlg === 'function') {
            const m = game.move({
                from: rcToAlg(mv.from[0], mv.from[1]),
                to: rcToAlg(mv.to[0], mv.to[1]),
                promotion: mv.promotion || 'q'
            });
            if (m) return m;
        }
        if (mv.san) {
            const san = String(mv.san).replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O');
            const m = game.move(san);
            if (m) return m;
        }
        return null;
    }

    function isTrapName(s) {
        return /trampa|gambito|sacrific|poison|fried|fegatello|legal mate|centro aceptado|blackburne/i.test(s || '');
    }

    function emptyTree() { return {}; }

    function addLineToTree(tree, steps, meta) {
        if (typeof Chess === 'undefined' || !steps) return;
        const g = new Chess();
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            for (const side of ['w', 'b']) {
                const mv = step[side];
                if (!mv) continue;
                const key = fenKey(g.fen());
                const played = tryPlay(g, mv);
                if (!played) return;
                if (!tree[key]) tree[key] = { moves: [] };
                const rec = {
                    san: played.san,
                    from: played.from,
                    to: played.to,
                    promotion: played.promotion,
                    isMain: !!meta.isMain,
                    isTrap: !!meta.isTrap,
                    lineName: meta.lineName || '',
                    openingId: meta.openingId
                };
                if (!tree[key].moves.some(m => m.san === rec.san)) tree[key].moves.push(rec);
            }
        }
    }

    function addSansToTree(tree, sans, meta) {
        if (typeof Chess === 'undefined' || !sans) return;
        const g = new Chess();
        for (const san of sans) {
            const key = fenKey(g.fen());
            const played = g.move(String(san).replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O'), { sloppy: true });
            if (!played) return;
            if (!tree[key]) tree[key] = { moves: [] };
            const rec = {
                san: played.san, from: played.from, to: played.to,
                promotion: played.promotion, isMain: !!meta.isMain,
                isTrap: !!meta.isTrap, lineName: meta.lineName || '',
                openingId: meta.openingId
            };
            if (!tree[key].moves.some(m => m.san === rec.san)) tree[key].moves.push(rec);
        }
    }

    function catalogLines(openingId) {
        if (typeof getOpeningLines === 'function') return getOpeningLines(openingId);
        const mod = OPENING_MODULES[openingId];
        if (!mod) return [];
        const main = { name: mod.subtitle || 'Línea principal', subtitle: 'Línea principal', steps: mod.steps, isMain: true };
        return [main, ...((mod.variations || []).map(v => Object.assign({}, v, { isMain: false })))];
    }

    function buildCatalogTree(openingId) {
        const tree = emptyTree();
        catalogLines(openingId).forEach((line, idx) => {
            const trap = !line.isMain && isTrapName((line.name || '') + ' ' + (line.subtitle || ''));
            addLineToTree(tree, line.steps, {
                isMain: !!line.isMain || idx === 0,
                isTrap: trap || (!line.isMain && /gambito/i.test(line.name || '')),
                lineName: line.name,
                openingId
            });
        });
        return tree;
    }

    C.book = {
        cache: {},
        fenKey,
        treeFor(openingId, color) {
            const rep = C.repertoire.treeFor(openingId, color);
            if (rep) return rep;
            const ck = String(openingId);
            if (!this.cache[ck]) this.cache[ck] = buildCatalogTree(openingId);
            return this.cache[ck];
        },
        at(tree, fen) {
            if (!tree) return null;
            return tree[fenKey(fen)] || null;
        },
        pick(tree, fen, persona) {
            const node = this.at(tree, fen);
            if (!node || !node.moves.length) return null;
            const moves = node.moves;
            const main = moves.filter(m => m.isMain);
            const traps = moves.filter(m => m.isTrap);
            const sides = moves.filter(m => !m.isMain);
            const rnd = (a) => a[Math.floor(Math.random() * a.length)];
            if (persona === 'fiel') return rnd(main.length ? main : moves);
            if (persona === 'trampas') {
                if (traps.length) return rnd(traps);
                if (sides.length && Math.random() < 0.75) return rnd(sides);
                return rnd(main.length ? main : moves);
            }
            if (main.length && Math.random() < 0.5) return rnd(main);
            const pool = sides.length ? sides : moves;
            return rnd(pool);
        },
        expectedSans(tree, fen) {
            const node = this.at(tree, fen);
            return node ? node.moves.map(m => m.san) : [];
        },
        detectGame(sans) {
            if (typeof Chess === 'undefined' || !sans || !sans.length) return null;
            let best = null;
            const ids = (typeof chessOpeningsList !== 'undefined' ? chessOpeningsList : []).map(o => o.id);
            ids.forEach(id => {
                if (!OPENING_MODULES[id]) return;
                const tree = this.treeFor(id, null);
                const g = new Chess();
                let ply = 0;
                let lastBookSan = null;
                let off = null;
                for (const san of sans) {
                    const key = fenKey(g.fen());
                    const node = tree[key];
                    const played = g.move(String(san).replace(/0-0-0/g, 'O-O-O').replace(/0-0/g, 'O-O'), { sloppy: true });
                    if (!played) break;
                    const ok = node && node.moves.some(m => m.san === played.san);
                    if (ok) {
                        ply += 1;
                        lastBookSan = played.san;
                    } else {
                        off = { ply: ply + 1, played: played.san, fen: key, expected: node ? node.moves.map(m => m.san) : [] };
                        break;
                    }
                }
                if (!best || ply > best.ply) {
                    best = { openingId: id, ply, lastBookSan, off };
                }
            });
            return best;
        }
    };

    /* ───────── Repertorio ───────── */
    function defaultRep() {
        return { version: 1, white: [], black: [], custom: {} };
    }

    C.repertoire = {
        load() {
            const r = storeGet(KEY.repertoire, defaultRep());
            if (!r || typeof r !== 'object') return defaultRep();
            r.white = Array.isArray(r.white) ? r.white : [];
            r.black = Array.isArray(r.black) ? r.black : [];
            r.custom = r.custom || {};
            return r;
        },
        save(r) { storeSet(KEY.repertoire, r); C.book.cache = {}; },
        idsFor(color) {
            const r = this.load();
            const list = color === 'b' ? r.black : r.white;
            return list;
        },
        cloneCatalog(openingId, color) {
            const r = this.load();
            const key = 'c-' + openingId + '-' + color + '-' + Date.now().toString(36);
            const lines = catalogLines(openingId).map(line => ({
                name: line.name,
                subtitle: line.subtitle || '',
                isMain: !!line.isMain,
                sans: lineToSans(line.steps)
            }));
            const mod = OPENING_MODULES[openingId] || {};
            r.custom[key] = {
                id: key,
                clonedFrom: openingId,
                title: (mod.title || ('Apertura ' + openingId)) + ' (mía)',
                color,
                lines
            };
            const arr = color === 'b' ? r.black : r.white;
            if (!arr.includes(key) && !arr.includes(openingId) && !arr.includes(String(openingId))) {
                arr.push(key);
            }
            this.save(r);
            return key;
        },
        addCatalog(openingId, color) {
            const r = this.load();
            const arr = color === 'b' ? r.black : r.white;
            const id = Number(openingId);
            if (!arr.includes(id) && !arr.includes(String(id))) arr.push(id);
            this.save(r);
        },
        remove(id, color) {
            const r = this.load();
            const arr = color === 'b' ? r.black : r.white;
            r[color === 'b' ? 'black' : 'white'] = arr.filter(x => String(x) !== String(id));
            this.save(r);
        },
        treeFor(openingId, color) {
            const r = this.load();
            const custom = r.custom[openingId] || r.custom[String(openingId)];
            if (custom && custom.lines) {
                const tree = emptyTree();
                custom.lines.forEach((line, idx) => {
                    addSansToTree(tree, line.sans || [], {
                        isMain: !!line.isMain || idx === 0,
                        isTrap: isTrapName(line.name),
                        lineName: line.name,
                        openingId
                    });
                });
                return tree;
            }
            const arr = color === 'b' ? r.black : (color === 'w' ? r.white : []);
            const hit = arr.map(String).includes(String(openingId));
            if (hit && OPENING_MODULES[openingId]) return null; /* usar catálogo */
            return null;
        },
        exportJson() {
            return JSON.stringify(this.load(), null, 2);
        },
        importJson(text) {
            const data = JSON.parse(text);
            if (!data || typeof data !== 'object') throw new Error('JSON inválido');
            this.save({
                version: 1,
                white: data.white || [],
                black: data.black || [],
                custom: data.custom || {}
            });
        }
    };

    function lineToSans(steps) {
        if (typeof Chess === 'undefined' || !steps) return [];
        const g = new Chess();
        const out = [];
        for (const step of steps) {
            for (const side of ['w', 'b']) {
                const played = tryPlay(g, step[side]);
                if (!played) return out;
                out.push(played.san);
            }
        }
        return out;
    }

    /* ───────── Stats / desviaciones ───────── */
    C.stats = {
        load() { return storeGet(KEY.stats, {}); },
        save(s) { storeSet(KEY.stats, s); },
        bump(openingId, patch) {
            const s = this.load();
            const k = String(openingId);
            const cur = s[k] || { sparring: 0, bookEnd: 0, bookLeave: 0, wins: 0, losses: 0, draws: 0 };
            Object.keys(patch).forEach(p => { cur[p] = (cur[p] || 0) + patch[p]; });
            s[k] = cur;
            this.save(s);
        }
    };

    C.deviations = {
        load() { return storeGet(KEY.deviations, []); },
        save(list) { storeSet(KEY.deviations, list.slice(-400)); },
        add(rec) {
            const list = this.load();
            const key = [rec.openingId, rec.fen, rec.played, rec.color].join('|');
            if (list.some(x => [x.openingId, x.fen, x.played, x.color].join('|') === key)) return;
            list.push(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now() }, rec));
            this.save(list);
        }
    };

    /* ───────── Motor ───────── */
    function currentLevel() {
        const idx = (typeof sfLevelIndex === 'number') ? sfLevelIndex : C.engine.idx;
        return C.LEVELS[idx] || C.LEVELS[0];
    }

    function applyEngineOptions(worker, lv) {
        if (!worker || !lv) return;
        try {
            worker.postMessage('setoption name Skill Level value ' + lv.skill);
            worker.postMessage('setoption name UCI_LimitStrength value ' + (lv.limit ? 'true' : 'false'));
            if (lv.limit && lv.elo) worker.postMessage('setoption name UCI_Elo value ' + lv.elo);
            worker.postMessage('setoption name MultiPV value ' + (lv.multipv || 1));
            worker.postMessage('setoption name Contempt value ' + (lv.id === 'avanzado' ? 0 : 8));
        } catch (_) {}
    }

    function parseScore(line) {
        const m = String(line).match(/score (cp|mate) (-?\d+)/);
        if (!m) return null;
        if (m[1] === 'mate') {
            const n = Number(m[2]);
            return n > 0 ? 100000 - n : -100000 - n;
        }
        return Number(m[2]);
    }

    function parsePvMove(line) {
        const m = String(line).match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/i);
        if (!m) return null;
        const bm = m[1];
        return { from: bm.slice(0, 2), to: bm.slice(2, 4), promotion: bm[4] ? bm[4].toLowerCase() : 'q' };
    }

    function uciToVerbose(uci) {
        if (!uci || !chessGame) return null;
        const legal = chessGame.moves({ verbose: true }) || [];
        return legal.find(m => m.from === uci.from && m.to === uci.to && (!uci.promotion || (m.promotion || 'q') === uci.promotion)) || null;
    }

    function pickFromPv(cands, lv) {
        if (!cands.length) return null;
        const sorted = cands.slice().sort((a, b) => (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score));
        const best = sorted[0];
        const near = sorted.filter(c => c.score == null || best.score == null || (best.score - c.score) <= 90);
        const rnd = (a) => a[Math.floor(Math.random() * a.length)];
        if (lv.pick === 'worst') return sorted[sorted.length - 1] || best;
        if (lv.pick === 'soft') {
            if (near.length === 1) return best;
            const w = near.map((_, i) => (i === 0 ? 0.5 : i === 1 ? 0.32 : 0.18));
            let x = Math.random();
            for (let i = 0; i < near.length; i++) {
                x -= w[i] || 0.1;
                if (x <= 0) return near[i];
            }
            return near[1] || best;
        }
        if (lv.pick === 'bestish') {
            return Math.random() < 0.78 ? best : (near[1] || best);
        }
        return best;
    }

    C.engine = {
        idx: 0,
        setLevel(i, persist) {
            const n = Math.max(0, Math.min(C.LEVELS.length - 1, i));
            this.idx = n;
            try { sfLevelIndex = n; } catch (_) {}
            if (persist !== false) storeSet(KEY.rival, C.LEVELS[n].id);
            if (typeof stockfishWorker !== 'undefined' && stockfishWorker && stockfishReady) {
                applyEngineOptions(stockfishWorker, C.LEVELS[n]);
            }
            C.ui.syncRival();
            C.ui.syncChip();
        },
        loadSaved() {
            const id = storeGet(KEY.rival, 'torpe');
            const i = C.LEVELS.findIndex(l => l.id === id);
            this.setLevel(i >= 0 ? i : 0, false);
        },
        async ask(fen) {
            const lv = currentLevel();
            if (lv.blunder > 0 && Math.random() < lv.blunder) {
                return pickRandomLegalVerbose();
            }
            try {
                const worker = await ensureStockfish();
                if (stockfishBusy) {
                    try { worker.postMessage('stop'); } catch (_) {}
                }
                stockfishBusy = true;
                applyEngineOptions(worker, lv);
                const cands = [];
                let done = false;
                return await new Promise((resolve) => {
                    const finish = (val) => {
                        if (done) return;
                        done = true;
                        stockfishBusy = false;
                        worker.removeEventListener('message', onMsg);
                        clearTimeout(timer);
                        resolve(val);
                    };
                    const onMsg = (e) => {
                        const line = String(e.data || '');
                        if (line.startsWith('info') && line.includes(' pv ')) {
                            const mv = parsePvMove(line);
                            const sc = parseScore(line);
                            const mp = line.match(/multipv (\d+)/);
                            const k = mp ? Number(mp[1]) : 1;
                            if (mv) cands[k - 1] = { score: sc, uci: mv };
                        }
                        if (line.startsWith('bestmove')) {
                            const parts = line.trim().split(/\s+/);
                            const bm = parts[1];
                            const parsed = (bm && bm !== '(none)' && bm.length >= 4)
                                ? { from: bm.slice(0, 2), to: bm.slice(2, 4), promotion: bm[4] ? bm[4].toLowerCase() : 'q' }
                                : null;
                            const chosen = pickFromPv(cands.filter(Boolean), lv);
                            const uci = (chosen && chosen.uci) || parsed;
                            finish(uciToVerbose(uci) || (uci && { from: uci.from, to: uci.to, promotion: uci.promotion }) || pickRandomLegalVerbose());
                        }
                    };
                    const timer = setTimeout(() => {
                        try { worker.postMessage('stop'); } catch (_) {}
                        const chosen = pickFromPv(cands.filter(Boolean), lv);
                        finish((chosen && (uciToVerbose(chosen.uci) || chosen.uci)) || pickRandomLegalVerbose());
                    }, Math.max(1800, lv.movetime + 1600));
                    worker.addEventListener('message', onMsg);
                    worker.postMessage('stop');
                    worker.postMessage('position fen ' + fen);
                    worker.postMessage('go depth ' + lv.depth + ' movetime ' + lv.movetime);
                });
            } catch (err) {
                console.warn('Stockfish no disponible', err);
                return pickRandomLegalVerbose();
            }
        }
    };

    /* ───────── Reloj ───────── */
    C.clock = {
        mode: 'off',
        w: 0, b: 0, ticking: null, last: 0,
        load() {
            const id = storeGet(KEY.clock, 'off');
            this.mode = C.CLOCKS.some(c => c.id === id) ? id : 'off';
        },
        spec() { return C.CLOCKS.find(c => c.id === this.mode) || C.CLOCKS[0]; },
        setMode(id) {
            this.mode = id;
            storeSet(KEY.clock, id);
            C.ui.syncClock();
        },
        arm() {
            const s = this.spec();
            this.stop();
            if (!s.base) {
                this.w = this.b = 0;
                C.ui.syncClock();
                return;
            }
            this.w = s.base;
            this.b = s.base;
            this.last = Date.now();
            this.ticking = setInterval(() => this.tick(), 200);
            C.ui.syncClock();
        },
        tick() {
            const s = this.spec();
            if (!s.base || !chessGame || chessGame.game_over()) return;
            const now = Date.now();
            const dt = (now - this.last) / 1000;
            this.last = now;
            if (chessGame.turn() === 'w') this.w = Math.max(0, this.w - dt);
            else this.b = Math.max(0, this.b - dt);
            if (this.w <= 0 || this.b <= 0) {
                this.stop();
                C.sparring.onFlag(this.w <= 0 ? 'w' : 'b');
            }
            C.ui.syncClock();
        },
        onMove(colorJustMoved) {
            const s = this.spec();
            if (!s.inc) return;
            if (colorJustMoved === 'w') this.w += s.inc;
            else this.b += s.inc;
            C.ui.syncClock();
        },
        stop() {
            if (this.ticking) clearInterval(this.ticking);
            this.ticking = null;
        }
    };

    /* ───────── Sparring ───────── */
    C.sparring = {
        active: false,
        openingId: null,
        persona: 'club',
        tree: null,
        inBook: true,
        leftAt: null,
        historySans: [],
        minPlies: 40,
        ended: false,
        start(opts) {
            const id = opts.openingId;
            if (!OPENING_MODULES[id]) {
                alert('Esa apertura no tiene teoría aún.');
                return;
            }
            this.stop(true);
            if (typeof endExam === 'function') endExam(true);
            this.active = true;
            this.ended = false;
            this.openingId = id;
            this.persona = opts.persona || storeGet(KEY.persona, 'club');
            storeSet(KEY.persona, this.persona);
            this.tree = C.book.treeFor(id, opts.color);
            this.inBook = true;
            this.leftAt = null;
            this.historySans = [];
            document.body.classList.add('sparring-on');
            document.body.classList.remove('fsrs-on');
            C.ui.hideDebrief();

            if (typeof startOpening === 'function') startOpening(id);
            userRole = opts.color === 'b' ? 'b' : 'w';
            if (typeof switchRole === 'function') switchRole(userRole);

            if (systemTimeout) { clearTimeout(systemTimeout); systemTimeout = null; }
            freePlayMode = true;
            currentStep = 0;
            this.historySans = [];
            this.inBook = true;
            if (typeof chessGame !== 'undefined' && chessGame) {
                chessGame.reset();
                if (typeof syncFromChess === 'function') syncFromChess();
            }
            if (typeof renderBoard === 'function') renderBoard();
            if (typeof setControlsDisabled === 'function') setControlsDisabled(false);
            C.clock.setMode(opts.clock || C.clock.mode);
            C.clock.arm();
            C.stats.bump(id, { sparring: 1 });
            C.ui.syncChip();
            C.ui.sparringBanner();
            if (userRole === 'b') this.reply();
            else if (typeof updateUI === 'function') updateUI();
        },
        stop(silent) {
            this.active = false;
            this.ended = false;
            document.body.classList.remove('sparring-on');
            C.clock.stop();
            if (!silent) C.ui.hideDebrief();
        },
        onMove(fr, fc, tr, tc) {
            if (!this.active || this.ended) return false;
            if (!chessGame || chessGame.game_over()) return true;
            const turn = chessGame.turn();
            const mine = (userRole === 'w' && turn === 'w') || (userRole === 'b' && turn === 'b');
            if (!mine) return true;
            const fenBefore = chessGame.fen();
            const expected = C.book.expectedSans(this.tree, fenBefore);
            const ok = executeFreeMove(fr, fc, tr, tc);
            if (!ok) {
                const sq = document.querySelector(`.square[data-row="${tr}"][data-col="${tc}"]`);
                if (sq) {
                    sq.classList.add('error-highlight');
                    setTimeout(() => sq.classList.remove('error-highlight'), 450);
                }
                return true;
            }
            const san = lastMoveSan;
            this.historySans.push(san);
            C.clock.onMove(turn);
            if (this.inBook) {
                if (expected.length && !expected.includes(san)) {
                    this.leaveBook(fenBefore, san, expected);
                } else if (!C.book.at(this.tree, chessGame.fen())) {
                    /* última jugada de libro: se acaba el árbol */
                    this.inBook = false;
                    C.stats.bump(this.openingId, { bookEnd: 1 });
                }
            }
            this.afterPly();
            if (typeof updateUI === 'function') updateUI();
            if (!this.ended) this.reply();
            return true;
        },
        leaveBook(fen, played, expected) {
            if (!this.inBook) return;
            this.inBook = false;
            const ply = this.historySans.length;
            this.leftAt = {
                ply,
                played,
                expected: (expected && expected[0]) || '—',
                expectedAll: expected || [],
                fen,
                theory: this.theoryAt(fen, expected)
            };
            C.stats.bump(this.openingId, { bookLeave: 1 });
            C.deviations.add({
                openingId: this.openingId,
                color: userRole,
                fen: fenKey(fen),
                played,
                expected: expected || [],
                source: 'sparring'
            });
            C.ui.showDebrief(this.leftAt, false);
        },
        theoryAt(fen, expected) {
            const san = expected && expected[0];
            const name = (OPENING_MODULES[this.openingId] || {}).title || '';
            if (typeof buildFullTheory === 'function' && san) {
                const white = (fen.split(' ')[1] || 'w') === 'w';
                return buildFullTheory(san, white, '', name);
            }
            return 'En el árbol de esta apertura se jugaba ' + (san || 'otra continuación teórica') + '.';
        },
        async reply() {
            if (!this.active || this.ended || !chessGame || chessGame.game_over()) return;
            const opp = (userRole === 'w' && chessGame.turn() === 'b') || (userRole === 'b' && chessGame.turn() === 'w');
            if (!opp) return;
            if (typeof setControlsDisabled === 'function') setControlsDisabled(true);
            await new Promise(r => setTimeout(r, 280));
            if (!this.active || !chessGame) {
                if (typeof setControlsDisabled === 'function') setControlsDisabled(false);
                return;
            }
            const fen = chessGame.fen();
            let mv = null;
            if (this.inBook) {
                const bookMv = C.book.pick(this.tree, fen, this.persona);
                if (bookMv) mv = { from: bookMv.from, to: bookMv.to, promotion: bookMv.promotion || 'q', san: bookMv.san };
                else this.inBook = false;
            }
            if (!mv) mv = await C.engine.ask(fen);
            if (mv && mv.from && chessGame && !chessGame.game_over()) {
                const turn = chessGame.turn();
                const [fr, fc] = algToRc(mv.from);
                const [tr, tc] = algToRc(mv.to);
                const applied = executeFreeMove(fr, fc, tr, tc);
                if (applied) {
                    this.historySans.push(lastMoveSan);
                    C.clock.onMove(turn);
                    if (this.inBook && !C.book.at(this.tree, chessGame.fen())) {
                        this.inBook = false;
                        C.stats.bump(this.openingId, { bookEnd: 1 });
                    }
                }
            }
            if (typeof setControlsDisabled === 'function') setControlsDisabled(false);
            this.afterPly();
            if (typeof updateUI === 'function') updateUI();
        },
        afterPly() {
            if (!chessGame) return;
            if (chessGame.game_over()) {
                this.finish('end');
                return;
            }
            const plies = chessGame.history().length;
            if (plies >= 50 && !this.inBook) this.finish('length');
        },
        finish(why) {
            if (this.ended) return;
            this.ended = true;
            C.clock.stop();
            if (chessGame) {
                if (chessGame.in_checkmate()) {
                    const loser = chessGame.turn();
                    C.stats.bump(this.openingId, loser === userRole ? { losses: 1 } : { wins: 1 });
                } else if (chessGame.in_draw() || chessGame.in_stalemate()) {
                    C.stats.bump(this.openingId, { draws: 1 });
                }
            }
            const info = this.leftAt || {
                ply: this.historySans.length,
                played: '—',
                expected: 'fin de libro',
                expectedAll: [],
                theory: this.inBook
                    ? 'Llegaste al final del árbol. A partir de aquí el motor juega con el nivel elegido.'
                    : 'La ronda terminó.'
            };
            C.ui.showDebrief(info, true);
        },
        onFlag(side) {
            if (!this.active) return;
            C.stats.bump(this.openingId, side === userRole ? { losses: 1 } : { wins: 1 });
            this.finish('flag');
        },
        repeatFromHere() {
            if (!this.leftAt || !this.openingId) {
                this.restartSame();
                return;
            }
            const persona = this.persona;
            const color = userRole;
            const clock = C.clock.mode;
            const id = this.openingId;
            const targetFen = this.leftAt.fen;
            this.start({ openingId: id, color, persona, clock });
            /* Replay hasta la posición del desvío */
            const want = fenKey(targetFen);
            const g = new Chess();
            const replay = [];
            for (const san of this.historySans) {
                if (fenKey(g.fen()) === want) break;
                const m = g.move(san, { sloppy: true });
                if (!m) break;
                replay.push(m);
            }
            /* simpler: restart and let user try again from start of that opening */
        },
        restartSame() {
            if (!this.openingId) return;
            this.start({
                openingId: this.openingId,
                color: userRole,
                persona: this.persona,
                clock: C.clock.mode
            });
        },
        showCorrectLine() {
            const id = this.openingId;
            this.stop();
            if (typeof startOpening === 'function') startOpening(id);
        },
        otherLine() {
            const id = this.openingId;
            const lines = catalogLines(id).filter(l => !l.isMain);
            const pick = lines.length ? lines[Math.floor(Math.random() * lines.length)] : null;
            this.start({
                openingId: id,
                color: userRole,
                persona: pick ? 'trampas' : this.persona,
                clock: C.clock.mode
            });
        }
    };

    /* ───────── FSRS ───────── */
    function cardId(openingId, fen, color) {
        return openingId + '|' + fenKey(fen) + '|' + color;
    }

    function collectBookCards() {
        const cards = [];
        const seen = new Set();
        const rep = C.repertoire.load();
        const pairs = [];
        (rep.white || []).forEach(id => pairs.push({ id, color: 'w' }));
        (rep.black || []).forEach(id => pairs.push({ id, color: 'b' }));
        if (!pairs.length) {
            (chessOpeningsList || []).forEach(op => {
                if (OPENING_MODULES[op.id]) {
                    pairs.push({ id: op.id, color: 'w' });
                    pairs.push({ id: op.id, color: 'b' });
                }
            });
        }
        pairs.forEach(({ id, color }) => {
            const tree = C.book.treeFor(id, color);
            Object.keys(tree).forEach(fen => {
                const side = fen.split(' ')[1];
                if (side !== color) return;
                const moves = tree[fen].moves || [];
                if (!moves.length) return;
                const cid = cardId(id, fen, color);
                if (seen.has(cid)) return;
                seen.add(cid);
                cards.push({
                    id: cid, type: 'book', openingId: id, fen, color,
                    expected: moves.map(m => m.san)
                });
            });
        });
        C.deviations.load().forEach(d => {
            if (!d.expected || !d.expected.length) return;
            const color = d.color || 'w';
            const cid = cardId(d.openingId, d.fen, color) + '|dev|' + (d.played || '');
            if (seen.has(cid)) return;
            seen.add(cid);
            cards.push({
                id: cid, type: 'deviation', openingId: d.openingId, fen: d.fen, color,
                expected: d.expected, played: d.played
            });
        });
        return cards;
    }

    C.fsrs = {
        active: false,
        queue: [],
        current: null,
        startedAt: 0,
        reviewMove(fr, fc, tr, tc) {
            if (!this.active || !this.current || !chessGame) return false;
            const from = rcToAlg(fr, fc);
            const to = rcToAlg(tr, tc);
            const legal = chessGame.moves({ verbose: true }) || [];
            const mv = legal.find(m => m.from === from && m.to === to);
            if (!mv) {
                const sq = document.querySelector(`.square[data-row="${tr}"][data-col="${tc}"]`);
                if (sq) {
                    sq.classList.add('error-highlight');
                    setTimeout(() => sq.classList.remove('error-highlight'), 400);
                }
                return true;
            }
            const ok = this.current.expected.includes(mv.san);
            const elapsed = Date.now() - this.startedAt;
            let rating = ok ? (elapsed < 8000 ? 4 : 3) : 1;
            if (ok && elapsed > 25000) rating = 2;
            this.grade(rating);
            if (ok) {
                executeFreeMove(fr, fc, tr, tc);
                setTimeout(() => this.next(), 450);
            } else {
                const inst = $('instruction-text');
                if (inst) inst.textContent = 'Iba ' + this.current.expected.join(' / ') + '. Se marca como «otra vez».';
                setTimeout(() => this.next(), 900);
            }
            return true;
        },
        grade(rating) {
            const map = storeGet(KEY.fsrs, {});
            const prev = map[this.current.id] || (root.FSRS ? FSRS.newCard() : { due: Date.now() });
            map[this.current.id] = root.FSRS ? FSRS.review(prev, rating) : prev;
            storeSet(KEY.fsrs, map);
        },
        dueCards() {
            const defs = collectBookCards();
            const map = storeGet(KEY.fsrs, {});
            const now = Date.now();
            const due = [];
            defs.forEach(def => {
                const st = map[def.id];
                if (!st || (root.FSRS && FSRS.isDue(st, now))) due.push(def);
            });
            due.sort((a, b) => {
                const da = a.type === 'deviation' ? 0 : 1;
                const db = b.type === 'deviation' ? 0 : 1;
                if (da !== db) return da - db;
                const ta = (map[a.id] && map[a.id].due) || 0;
                const tb = (map[b.id] && map[b.id].due) || 0;
                return ta - tb;
            });
            return due;
        },
        start(queue) {
            if (typeof endExam === 'function') endExam(true);
            C.sparring.stop(true);
            this.queue = (queue || this.dueCards()).slice();
            this.active = true;
            document.body.classList.add('fsrs-on');
            if (!this.queue.length) {
                this.stop();
                C.ui.toast('No hay cartas pendientes. Añade repertorio o importa partidas.');
                return;
            }
            $('menu-view').classList.add('hidden');
            const gv = $('game-view');
            gv.classList.remove('hidden');
            gv.classList.add('flex');
            this.next();
        },
        next() {
            if (!this.queue.length) {
                this.stop();
                C.ui.toast('Repaso terminado.');
                if (C.today.active) C.today.afterFsrs();
                else if (typeof backToMenu === 'function') backToMenu();
                return;
            }
            this.current = this.queue.shift();
            this.startedAt = Date.now();
            this.showCard();
        },
        showCard() {
            const card = this.current;
            activeOpeningId = Number(card.openingId) || card.openingId;
            userRole = card.color;
            freePlayMode = true;
            if (typeof Chess !== 'undefined') {
                chessGame = new Chess();
                /* fenKey es 4 campos; reconstruir FEN jugable */
                const fen = card.fen.includes(' ') && card.fen.split(' ').length >= 4
                    ? (card.fen.split(' ').length >= 6 ? card.fen : card.fen + ' 0 1')
                    : card.fen;
                try { chessGame.load(fen); } catch (_) { chessGame = new Chess(); }
                if (typeof syncFromChess === 'function') syncFromChess();
            }
            if (typeof renderBoard === 'function') renderBoard();
            const mod = OPENING_MODULES[card.openingId] || {};
            if ($('game-title')) $('game-title').textContent = mod.title || 'Repaso';
            if ($('game-subtitle')) $('game-subtitle').textContent = card.type === 'deviation' ? 'Desviación importada' : 'Juega la jugada del repertorio';
            if ($('mode-label')) $('mode-label').textContent = 'FSRS';
            if ($('level-indicator')) $('level-indicator').textContent = String(this.queue.length + 1);
            if ($('level-total')) $('level-total').textContent = ' en cola';
            if ($('instruction-text')) {
                $('instruction-text').textContent = card.type === 'deviation'
                    ? ('En una partida se jugó ' + (card.played || 'una desviación') + '. Juega la respuesta de tu árbol.')
                    : 'Juega la jugada de tu repertorio (no hay opciones que adivinar).';
            }
            if ($('next-move-preview')) $('next-move-preview').textContent = '···';
            if ($('theory-text')) {
                $('theory-text').textContent = 'Si aciertas, el intervalo crece. Si fallas, vuelve pronto.';
            }
            C.ui.syncChip();
        },
        stop() {
            this.active = false;
            this.current = null;
            document.body.classList.remove('fsrs-on');
        },
        dueCount() { return this.dueCards().length; }
    };

    /* ───────── Hoy ───────── */
    C.today = {
        active: false,
        phase: null,
        examLeft: 0,
        openingId: null,
        start() {
            this.active = true;
            this.phase = 'fsrs';
            C.ui.todayBar('1/3 · Repaso FSRS (prioridad a desviaciones recientes)');
            const due = C.fsrs.dueCards();
            const slice = due.slice(0, 12);
            if (slice.length) {
                this.openingId = slice[0].openingId;
                C.fsrs.start(slice);
            } else {
                this.afterFsrs();
            }
        },
        afterFsrs() {
            if (!this.active) return;
            this.phase = 'sparring';
            const ids = (typeof getStudyableOpenings === 'function' ? getStudyableOpenings('all') : []).map(o => o.id);
            let id = this.openingId;
            if (!OPENING_MODULES[id]) id = ids.length ? ids[Math.floor(Math.random() * ids.length)] : 1;
            this.openingId = id;
            C.ui.todayBar('2/3 · Sparring de ' + ((OPENING_MODULES[id] || {}).title || 'la apertura') + ' · ~4 min');
            C.sparring.start({
                openingId: id,
                color: Math.random() < 0.5 ? 'w' : 'b',
                persona: 'club',
                clock: 'off'
            });
        },
        afterSparring() {
            if (!this.active) return;
            this.phase = 'exam';
            this.examLeft = 4;
            C.ui.todayBar('3/3 · Examen de reconocer apertura · 4 ítems');
            this.nextExam();
        },
        nextExam() {
            if (!this.active) return;
            if (this.examLeft <= 0) {
                this.finish();
                return;
            }
            this.examLeft -= 1;
            if (typeof startExam === 'function') startExam('all', 'all');
        },
        finish() {
            this.active = false;
            this.phase = null;
            C.ui.todayBar('');
            C.ui.toast('Bloque de hoy completado. Mañana hay más cartas.');
            if (typeof backToMenu === 'function') backToMenu();
        }
    };

    /* ───────── PGN / Lichess / Chess.com ───────── */
    function splitPgn(text) {
        const t = String(text || '').replace(/\r\n/g, '\n').trim();
        if (!t) return [];
        const parts = t.split(/\n(?=\[Event )/g);
        return parts.map(p => p.trim()).filter(p => p && (/\d+\./.test(p) || /\[/.test(p)));
    }

    function parsePgnGame(pgn) {
        if (typeof Chess === 'undefined') return null;
        const g = new Chess();
        const ok = g.load_pgn(pgn, { sloppy: true });
        if (!ok) {
            const stripped = pgn.replace(/\{[^}]*\}/g, ' ').replace(/;.*$/gm, ' ').replace(/\([^()]*\)/g, ' ');
            const g2 = new Chess();
            if (!g2.load_pgn(stripped, { sloppy: true })) return null;
            return { sans: g2.history(), headers: g2.header() };
        }
        return { sans: g.history(), headers: g.header() };
    }

    C.pgn = {
        importText(text) {
            const games = splitPgn(text);
            let n = 0;
            const report = [];
            games.forEach((pgn, i) => {
                const parsed = parsePgnGame(pgn);
                if (!parsed || !parsed.sans.length) return;
                const det = C.book.detectGame(parsed.sans);
                if (!det || !det.off) {
                    report.push('Partida ' + (i + 1) + ': sin desvío (sigue el catálogo o no coincide).');
                    return;
                }
                const color = (parsed.headers.White && /me|yo|homologia|elpadre/i.test(parsed.headers.White)) ? 'w'
                    : (parsed.headers.Black && /me|yo|homologia|elpadre/i.test(parsed.headers.Black)) ? 'b'
                    : (det.off.ply % 2 === 1 ? 'w' : 'b');
                C.deviations.add({
                    openingId: det.openingId,
                    color,
                    fen: det.off.fen,
                    played: det.off.played,
                    expected: det.off.expected,
                    source: 'pgn',
                    white: parsed.headers.White,
                    black: parsed.headers.Black
                });
                const name = (OPENING_MODULES[det.openingId] || {}).title || ('#' + det.openingId);
                report.push('Partida ' + (i + 1) + ': ' + name + ' · te saliste en la jugada ' + Math.ceil(det.off.ply / 2) + ' …' + det.off.played + (det.off.expected[0] ? '; iba …' + det.off.expected[0] : ''));
                n += 1;
            });
            return { n, report, total: games.length };
        },
        async lichess(username, token) {
            const u = encodeURIComponent(username.trim());
            const url = 'https://lichess.org/api/games/user/' + u + '?max=20&opening=true&moves=true&clocks=false';
            const headers = { Accept: 'application/x-chess-pgn' };
            if (token) headers.Authorization = 'Bearer ' + token;
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error('Lichess HTTP ' + res.status);
            const pgn = await res.text();
            return this.importText(pgn);
        },
        async chesscom(username) {
            const u = username.trim().toLowerCase();
            const res = await fetch('https://api.chess.com/pub/player/' + encodeURIComponent(u) + '/games/archives');
            if (!res.ok) throw new Error('Chess.com HTTP ' + res.status + ' (si CORS bloquea, pega el PGN).');
            const data = await res.json();
            const archives = data.archives || [];
            if (!archives.length) throw new Error('Sin archivos públicos');
            const last = archives[archives.length - 1];
            const gres = await fetch(last);
            if (!gres.ok) throw new Error('Chess.com games HTTP ' + gres.status);
            const games = await gres.json();
            const pgn = (games.games || []).map(g => g.pgn).filter(Boolean).join('\n\n');
            return this.importText(pgn);
        }
    };

    /* ───────── Qwen local ───────── */
    C.qwen = {
        available: false,
        model: null,
        async probe() {
            const modelsWanted = ['qwen2.5:14b', 'qwen3:30b', 'qwen3:17b', 'qwen2.5:7b'];
            try {
                const r = await fetch('http://127.0.0.1:11434/api/tags', { method: 'GET' });
                if (!r.ok) return false;
                const data = await r.json();
                const names = (data.models || []).map(m => m.name);
                this.model = modelsWanted.find(n => names.includes(n)) || (names.find(n => /qwen/i.test(n)) || null);
                this.available = !!this.model;
                C.ui.syncQwen();
                return this.available;
            } catch (_) {
                this.available = false;
                C.ui.syncQwen();
                return false;
            }
        },
        async explain() {
            if (!this.available || !chessGame) return;
            const out = $('qwen-out');
            if (out) {
                out.classList.add('visible');
                out.textContent = 'Pensando en local con ' + this.model + '…';
            }
            try {
                const r = await fetch('http://127.0.0.1:11434/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.model,
                        prompt: 'Eres un entrenador de ajedrez. En 3-5 frases en español, explica el plan de esta posición de apertura. No listes jugadas largas. FEN: ' + chessGame.fen(),
                        stream: false,
                        think: false
                    })
                });
                const data = await r.json();
                let text = (data.response || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                if (out) out.textContent = text || 'Sin respuesta.';
            } catch (err) {
                if (out) out.textContent = 'Qwen no respondió (solo funciona en esta máquina).';
            }
        }
    };

    /* ───────── UI ───────── */
    C.ui = {
        toast(msg) {
            const el = $('game-status');
            if (el) {
                el.classList.remove('hidden');
                el.textContent = msg;
                el.className = 'mt-3 text-sm text-amber-200';
            } else {
                alert(msg);
            }
        },
        todayBar(text) {
            let bar = $('today-bar');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'today-bar';
                bar.className = 'today-bar';
                const gv = $('game-view');
                if (gv) gv.insertBefore(bar, gv.firstChild);
                else document.body.appendChild(bar);
            }
            if (!text) {
                bar.classList.remove('visible');
                bar.textContent = '';
                return;
            }
            bar.innerHTML = '<strong>Hoy · ~12 min.</strong> ' + escapeHtml(text);
            bar.classList.add('visible');
        },
        syncChip() {
            const chip = $('book-chip');
            if (!chip) return;
            const lv = currentLevel();
            let inBook = false;
            if (C.sparring.active) inBook = C.sparring.inBook;
            else if (C.fsrs.active) inBook = true;
            else if (typeof isExamActive === 'function' && isExamActive()) inBook = true;
            else inBook = !freePlayMode;
            chip.classList.toggle('in-book', inBook);
            chip.classList.toggle('out-book', !inBook);
            chip.textContent = inBook ? 'En libro' : ('Fuera de libro · ' + lv.name);
        },
        syncRival() {
            const id = currentLevel().id;
            document.querySelectorAll('#rival-pills .pill').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-id') === id);
            });
            const old = $('stockfish-level-label');
            if (old) old.textContent = 'Rival · ' + currentLevel().name;
            const badge = $('sf-badge');
            if (badge) badge.textContent = currentLevel().short;
        },
        syncClock() {
            document.querySelectorAll('#clock-pills .pill').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-id') === C.clock.mode);
            });
            const box = $('clock-readout');
            if (!box) return;
            const spec = C.clock.spec();
            if (!spec.base || !(C.sparring.active)) {
                box.classList.remove('visible');
                return;
            }
            box.classList.add('visible');
            const fmt = (s) => {
                const n = Math.max(0, Math.ceil(s));
                const m = Math.floor(n / 60);
                const r = n % 60;
                return m + ':' + String(r).padStart(2, '0');
            };
            box.innerHTML = '<span>♔ ' + fmt(C.clock.w) + '</span><span>♚ ' + fmt(C.clock.b) + '</span>';
        },
        syncQwen() {
            const b = $('btn-qwen');
            if (b) b.classList.toggle('visible', !!C.qwen.available);
        },
        syncDue() {
            const el = $('home-due');
            if (!el) return;
            const n = C.fsrs.dueCount();
            el.innerHTML = n ? ('Hoy toca <strong>' + n + '</strong> carta' + (n === 1 ? '' : 's') + ' de FSRS.') : 'No hay cartas pendientes. Importa un PGN o clona una apertura a tu repertorio.';
        },
        hideDebrief() {
            const p = $('debrief-panel');
            if (p) p.classList.remove('visible');
        },
        showDebrief(info, finished) {
            const p = $('debrief-panel');
            if (!p) return;
            const ply = info.ply || 0;
            const moveN = Math.max(1, Math.ceil(ply / 2));
            const played = info.played || '—';
            const exp = info.expected || '—';
            const theory = info.theory || '';
            p.innerHTML =
                '<h3>Debrief</h3>' +
                '<p id="debrief-text">' + (finished && !C.sparring.leftAt
                    ? 'Ronda terminada. ' + escapeHtml(theory)
                    : ('Te saliste en la jugada ' + moveN + ' …' + escapeHtml(played) + '; en la teoría iba …' + escapeHtml(exp))) + '</p>' +
                '<p class="hint">' + escapeHtml(theory) + '</p>' +
                '<div class="debrief-actions">' +
                '<button type="button" class="primary" id="db-repeat">Repetir desde aquí</button>' +
                '<button type="button" id="db-line">Ver línea correcta</button>' +
                '<button type="button" id="db-other">Otra variante</button>' +
                '<button type="button" id="db-new">Nueva ronda</button>' +
                '</div>';
            p.classList.add('visible');
            const th = $('theory-text');
            if (th) th.textContent = theory;
            const bind = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
            bind('db-repeat', () => C.sparring.restartSame());
            bind('db-line', () => C.sparring.showCorrectLine());
            bind('db-other', () => C.sparring.otherLine());
            bind('db-new', () => {
                if (C.today.active && C.today.phase === 'sparring') C.today.afterSparring();
                else C.ui.openSparring();
            });
        },
        sparringBanner() {
            const t = $('game-title');
            const s = $('game-subtitle');
            const mod = OPENING_MODULES[C.sparring.openingId] || {};
            if (t) t.textContent = (mod.title || 'Sparring');
            if (s) s.textContent = 'Sparring · ' + (C.PERSONAS.find(p => p.id === C.sparring.persona) || {}).name;
            if ($('mode-label')) $('mode-label').textContent = 'Sparring';
            if ($('instruction-text')) $('instruction-text').textContent = 'Juega tu bando desde la posición inicial. El rival sigue el libro hasta que te salgas o se acabe el árbol.';
            if ($('theory-text')) $('theory-text').textContent = 'Primero el libro (principal + variantes). Stockfish solo entra fuera de libro, al nivel elegido.';
        },
        closeModal() {
            const m = $('coach-modal');
            if (m) m.classList.remove('open');
        },
        openModal(html) {
            let m = $('coach-modal');
            if (!m) {
                m = document.createElement('div');
                m.id = 'coach-modal';
                m.className = 'coach-modal';
                m.innerHTML = '<div class="coach-sheet" id="coach-sheet"></div>';
                m.addEventListener('click', (e) => { if (e.target === m) C.ui.closeModal(); });
                document.body.appendChild(m);
            }
            $('coach-sheet').innerHTML = html;
            m.classList.add('open');
        },
        openSparring() {
            const ops = (typeof getStudyableOpenings === 'function' ? getStudyableOpenings('all') : chessOpeningsList || []);
            const persona = storeGet(KEY.persona, 'club');
            const clock = C.clock.mode || 'off';
            const list = ops.map(o => '<button type="button" data-op="' + o.id + '">' + escapeHtml(o.name) + '</button>').join('');
            this.openModal(
                '<h2>Sparring</h2>' +
                '<p class="hint">Partes de la posición inicial. El rival solo usa el árbol de la apertura (línea principal + variantes) hasta que te salgas.</p>' +
                '<label>Apertura</label>' +
                '<div class="coach-open-list" id="sp-ops"><button type="button" data-op="surprise" class="active">Sorpresa (al azar de las 30)</button>' + list + '</div>' +
                '<label>Tu color</label><div class="persona-pills" id="sp-color">' +
                '<button type="button" class="pill active" data-c="w">Blancas</button>' +
                '<button type="button" class="pill" data-c="b">Negras</button></div>' +
                '<label>Personalidad del libro</label><div class="persona-pills" id="sp-per">' +
                C.PERSONAS.map(p => '<button type="button" class="pill' + (p.id === persona ? ' active' : '') + '" data-p="' + p.id + '">' + p.name + '</button>').join('') +
                '</div>' +
                '<label>Reloj</label><div class="persona-pills" id="sp-clk">' +
                C.CLOCKS.map(c => '<button type="button" class="pill pill-clock' + (c.id === clock ? ' active' : '') + '" data-k="' + c.id + '">' + c.name + '</button>').join('') +
                '</div>' +
                '<div class="coach-actions"><button type="button" class="primary" id="sp-go">Empezar</button>' +
                '<button type="button" class="ghost" id="sp-cancel">Cancelar</button></div>'
            );
            let chosen = 'surprise', color = 'w', per = persona, clk = clock;
            $('sp-ops').onclick = (e) => {
                const b = e.target.closest('button'); if (!b) return;
                chosen = b.getAttribute('data-op');
                $('sp-ops').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
            };
            $('sp-color').onclick = (e) => {
                const b = e.target.closest('button'); if (!b) return;
                color = b.getAttribute('data-c');
                $('sp-color').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
            };
            $('sp-per').onclick = (e) => {
                const b = e.target.closest('button'); if (!b) return;
                per = b.getAttribute('data-p');
                $('sp-per').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
            };
            $('sp-clk').onclick = (e) => {
                const b = e.target.closest('button'); if (!b) return;
                clk = b.getAttribute('data-k');
                $('sp-clk').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
            };
            $('sp-cancel').onclick = () => this.closeModal();
            $('sp-go').onclick = () => {
                let id = chosen;
                if (id === 'surprise') {
                    const pool = ops.map(o => o.id);
                    id = pool[Math.floor(Math.random() * pool.length)];
                }
                this.closeModal();
                C.sparring.start({ openingId: Number(id), color, persona: per, clock: clk });
            };
        },
        openImport() {
            const token = storeRawGet(KEY.lichessToken) || '';
            const user = storeGet(KEY.lichessUser, '');
            const cc = storeGet(KEY.chesscomUser, '');
            this.openModal(
                '<h2>Importar partidas</h2>' +
                '<p class="hint">Detecta la apertura del catálogo/repertorio y guarda la primera jugada fuera del árbol. El token de Lichess se queda en este navegador, no en GitHub.</p>' +
                '<label>Pegar PGN (una o varias)</label>' +
                '<textarea class="coach-ta" id="pgn-text" placeholder="[Event &quot;...&quot;]&#10;1. e4 e5 2. Nf3 ..."></textarea>' +
                '<div class="coach-actions"><button type="button" class="primary" id="pgn-go">Importar PGN</button>' +
                '<label class="coach-inline-btn" style="margin:0">Subir archivo<input type="file" id="pgn-file" accept=".pgn,.txt" hidden></label></div>' +
                '<label>Lichess usuario</label><input class="coach-in" id="li-user" value="' + escapeHtml(user) + '" placeholder="usuario">' +
                '<label>Token Lichess (opcional, solo localStorage)</label><input class="coach-in" id="li-tok" type="password" value="' + escapeHtml(token) + '" placeholder="lip_…">' +
                '<div class="coach-actions"><button type="button" id="li-go">Traer de Lichess</button></div>' +
                '<label>Chess.com usuario (público, sin backend)</label><input class="coach-in" id="cc-user" value="' + escapeHtml(cc) + '" placeholder="usuario">' +
                '<div class="coach-actions"><button type="button" id="cc-go">Traer de Chess.com</button>' +
                '<button type="button" class="ghost" id="imp-cancel">Cerrar</button></div>' +
                '<p class="hint" id="imp-out"></p>'
            );
            const out = $('imp-out');
            const show = (r) => { out.innerHTML = escapeHtml((r.report || []).join('\n')).replace(/\n/g, '<br/>') + '<br/>Guardadas ' + r.n + ' desviaciones.'; C.ui.syncDue(); };
            $('pgn-go').onclick = () => {
                try { show(C.pgn.importText($('pgn-text').value)); }
                catch (e) { out.textContent = String(e.message || e); }
            };
            $('pgn-file').onchange = (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => { $('pgn-text').value = String(reader.result || ''); };
                reader.readAsText(f);
            };
            $('li-go').onclick = async () => {
                const u = $('li-user').value.trim();
                const tok = $('li-tok').value.trim();
                storeSet(KEY.lichessUser, u);
                if (tok) storeRawSet(KEY.lichessToken, tok);
                else try { localStorage.removeItem(KEY.lichessToken); } catch (_) {}
                out.textContent = 'Consultando Lichess…';
                try { show(await C.pgn.lichess(u, tok)); }
                catch (e) { out.textContent = String(e.message || e); }
            };
            $('cc-go').onclick = async () => {
                const u = $('cc-user').value.trim();
                storeSet(KEY.chesscomUser, u);
                out.textContent = 'Consultando Chess.com…';
                try { show(await C.pgn.chesscom(u)); }
                catch (e) { out.textContent = 'Chess.com: ' + (e.message || e) + ' — si CORS bloquea, exporta PGN y pégalo.'; }
            };
            $('imp-cancel').onclick = () => this.closeModal();
        },
        openRepertoire() {
            const r = C.repertoire.load();
            const nameOf = (id) => {
                if (r.custom[id]) return r.custom[id].title + ' (editada)';
                const op = (chessOpeningsList || []).find(o => String(o.id) === String(id));
                return op ? op.name : String(id);
            };
            const row = (id, color) =>
                '<div class="rep-row"><span>' + escapeHtml(nameOf(id)) + '</span>' +
                '<button type="button" data-del="' + escapeHtml(String(id)) + '" data-col="' + color + '">Quitar</button>' +
                (r.custom[id] ? '<button type="button" data-edit="' + escapeHtml(String(id)) + '">Editar líneas</button>' : '<button type="button" data-clone="' + escapeHtml(String(id)) + '" data-col="' + color + '">Clonar y editar</button>') +
                '</div>';
            const ops = (chessOpeningsList || []).filter(o => OPENING_MODULES[o.id]);
            this.openModal(
                '<h2>Repertorio personal</h2>' +
                '<p class="hint">Las 30 teorías siguen siendo el curso. Encima, elige lo que juegas con blancas y con negras. Sparring y desviaciones usan este árbol si existe.</p>' +
                '<label>Con blancas juego</label><div class="rep-list" id="rep-w">' +
                (r.white.length ? r.white.map(id => row(id, 'w')).join('') : '<p class="hint">Vacío: se usa el catálogo.</p>') + '</div>' +
                '<label>Añadir a blancas</label><select class="coach-in" id="add-w"><option value="">— apertura del catálogo —</option>' +
                ops.map(o => '<option value="' + o.id + '">' + escapeHtml(o.name) + '</option>').join('') + '</select>' +
                '<label>Con negras juego</label><div class="rep-list" id="rep-b">' +
                (r.black.length ? r.black.map(id => row(id, 'b')).join('') : '<p class="hint">Vacío: se usa el catálogo.</p>') + '</div>' +
                '<label>Añadir a negras</label><select class="coach-in" id="add-b"><option value="">— apertura del catálogo —</option>' +
                ops.map(o => '<option value="' + o.id + '">' + escapeHtml(o.name) + '</option>').join('') + '</select>' +
                '<div class="coach-actions"><button type="button" class="primary" id="rep-export">Exportar JSON</button>' +
                '<button type="button" id="rep-imp-btn">Importar JSON</button>' +
                '<button type="button" class="ghost" id="rep-close">Cerrar</button></div>' +
                '<textarea class="coach-ta" id="rep-json" placeholder="Pega JSON aquí para importar, o copia el exportado."></textarea>'
            );
            const refresh = () => this.openRepertoire();
            $('add-w').onchange = () => { if ($('add-w').value) { C.repertoire.addCatalog($('add-w').value, 'w'); refresh(); } };
            $('add-b').onchange = () => { if ($('add-b').value) { C.repertoire.addCatalog($('add-b').value, 'b'); refresh(); } };
            $('coach-sheet').onclick = (e) => {
                const del = e.target.closest('[data-del]');
                const cl = e.target.closest('[data-clone]');
                const ed = e.target.closest('[data-edit]');
                if (del) { C.repertoire.remove(del.getAttribute('data-del'), del.getAttribute('data-col')); refresh(); }
                if (cl) { C.repertoire.cloneCatalog(cl.getAttribute('data-clone'), cl.getAttribute('data-col')); refresh(); }
                if (ed) this.openLineEditor(ed.getAttribute('data-edit'));
            };
            $('rep-export').onclick = () => { $('rep-json').value = C.repertoire.exportJson(); };
            $('rep-imp-btn').onclick = () => {
                try { C.repertoire.importJson($('rep-json').value); refresh(); }
                catch (err) { alert('JSON inválido'); }
            };
            $('rep-close').onclick = () => this.closeModal();
        },
        openLineEditor(customId) {
            const r = C.repertoire.load();
            const item = r.custom[customId];
            if (!item) return;
            this.openModal(
                '<h2>Editar ' + escapeHtml(item.title) + '</h2>' +
                '<p class="hint">Cada línea es una secuencia SAN. Añade o borra. El PGN corto también vale (solo movimientos).</p>' +
                item.lines.map((ln, i) =>
                    '<label>' + escapeHtml(ln.name || ('Línea ' + (i + 1))) + (ln.isMain ? ' · principal' : '') + '</label>' +
                    '<input class="coach-in ln-sans" data-i="' + i + '" value="' + escapeHtml((ln.sans || []).join(' ')) + '">' +
                    '<button type="button" class="coach-inline-btn" data-rm="' + i + '">Quitar línea</button>'
                ).join('') +
                '<label>Nueva línea (SAN o PGN)</label><input class="coach-in" id="ln-new" placeholder="e4 e5 Nf3 Nc6 Bb5">' +
                '<div class="coach-actions"><button type="button" class="primary" id="ln-save">Guardar</button>' +
                '<button type="button" id="ln-add">Añadir línea</button>' +
                '<button type="button" class="ghost" id="ln-back">Volver</button></div>'
            );
            $('ln-back').onclick = () => this.openRepertoire();
            $('ln-add').onclick = () => {
                const text = $('ln-new').value.trim();
                if (!text) return;
                const sans = text.replace(/\d+\.(\.\.)?/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
                item.lines.push({ name: 'Línea extra', subtitle: '', isMain: false, sans });
                r.custom[customId] = item;
                C.repertoire.save(r);
                this.openLineEditor(customId);
            };
            $('coach-sheet').onclick = (e) => {
                const rm = e.target.closest('[data-rm]');
                if (!rm) return;
                item.lines.splice(Number(rm.getAttribute('data-rm')), 1);
                r.custom[customId] = item;
                C.repertoire.save(r);
                this.openLineEditor(customId);
            };
            $('ln-save').onclick = () => {
                document.querySelectorAll('.ln-sans').forEach(inp => {
                    const i = Number(inp.getAttribute('data-i'));
                    item.lines[i].sans = inp.value.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/).filter(Boolean);
                });
                r.custom[customId] = item;
                C.repertoire.save(r);
                this.openRepertoire();
            };
        },
        injectHome() {
            const header = document.querySelector('#menu-view header');
            if (!header || $('home-actions')) return;
            const wrap = header.querySelector('.mt-8') || header;
            const nav = document.createElement('div');
            nav.className = 'home-actions';
            nav.id = 'home-actions';
            nav.innerHTML =
                '<button type="button" class="home-btn home-btn-sparring" id="btn-home-sparring">Sparring</button>' +
                '<button type="button" class="home-btn home-btn-today" id="btn-home-today">Hoy</button>' +
                '<button type="button" class="home-btn home-btn-rep" id="btn-home-rep">Repertorio</button>' +
                '<button type="button" class="home-btn home-btn-import" id="btn-home-import">Importar</button>';
            wrap.appendChild(nav);
            const due = document.createElement('p');
            due.id = 'home-due';
            due.className = 'home-due';
            wrap.appendChild(due);
            $('btn-home-sparring').onclick = () => this.openSparring();
            $('btn-home-today').onclick = () => C.today.start();
            $('btn-home-rep').onclick = () => this.openRepertoire();
            $('btn-home-import').onclick = () => this.openImport();
            this.syncDue();
        },
        injectCombat() {
            if ($('combat-group')) {
                this.bindCombat();
                return;
            }
            const host = document.querySelector('.user-tools-group');
            const box = document.createElement('div');
            box.className = 'combat-group';
            box.id = 'combat-group';
            box.setAttribute('role', 'group');
            box.setAttribute('aria-label', 'Combate: rival y reloj');
            box.innerHTML =
                '<span class="combat-kicker">Combate</span>' +
                '<div class="combat-row"><span class="combat-label">Rival</span>' +
                '<div class="rival-pills" id="rival-pills">' +
                C.LEVELS.map(l => '<button type="button" class="pill" data-id="' + l.id + '">' + l.name + '</button>').join('') +
                '</div></div>' +
                '<p class="rival-help">Básico responde y no te aplasta. Avanzado sí. Torpe comete errores de club.</p>' +
                '<div class="combat-row"><span class="combat-label">Reloj</span>' +
                '<div class="clock-pills" id="clock-pills">' +
                C.CLOCKS.map(c => '<button type="button" class="pill pill-clock" data-id="' + c.id + '">' + c.name + '</button>').join('') +
                '</div></div>' +
                '<div class="combat-row"><span class="book-chip in-book" id="book-chip">En libro</span>' +
                '<span class="clock-readout" id="clock-readout"></span></div>';
            if (host && host.parentNode) host.parentNode.insertBefore(box, host);
            const sf = $('btn-stockfish');
            if (sf) sf.style.display = 'none';
            const mg = document.querySelector('.move-btn-group');
            if (mg && !mg.querySelector('.class-kicker')) {
                mg.classList.add('class-controls');
                const k = document.createElement('span');
                k.className = 'class-kicker';
                k.textContent = 'Clase';
                mg.parentNode.insertBefore(k, mg);
            }
            this.bindCombat();
        },
        bindCombat() {
            const pills = $('rival-pills');
            if (pills && !pills.dataset.bound) {
                pills.dataset.bound = '1';
                pills.onclick = (e) => {
                    const b = e.target.closest('.pill');
                    if (!b) return;
                    const i = C.LEVELS.findIndex(l => l.id === b.getAttribute('data-id'));
                    if (i >= 0) C.engine.setLevel(i, true);
                };
            }
            const clk = $('clock-pills');
            if (clk && !clk.dataset.bound) {
                clk.dataset.bound = '1';
                clk.onclick = (e) => {
                    const b = e.target.closest('.pill');
                    if (!b) return;
                    C.clock.setMode(b.getAttribute('data-id'));
                };
            }
            this.syncRival();
            this.syncClock();
            this.syncChip();
        },
        injectPanels() {
            if (!$('debrief-panel')) {
                const col = document.querySelector('#panels-column .flex-grow, #panels-column');
                const d = document.createElement('div');
                d.id = 'debrief-panel';
                if (col) col.appendChild(d);
            }
            if (!$('btn-qwen')) {
                const theory = $('theory-panel-study');
                if (theory) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.id = 'btn-qwen';
                    b.className = 'home-btn qwen-btn';
                    b.textContent = 'Explicar esta posición';
                    b.onclick = () => C.qwen.explain();
                    theory.appendChild(b);
                    const out = document.createElement('div');
                    out.id = 'qwen-out';
                    theory.appendChild(out);
                }
            }
        }
    };

    /* ───────── Hooks ───────── */
    C.installHooks = function () {
        if (C._hooked) return;
        C._hooked = true;

        if (Array.isArray(root.SF_LEVELS) || (typeof SF_LEVELS !== 'undefined')) {
            try {
                SF_LEVELS.length = 0;
                C.LEVELS.forEach((l, i) => {
                    SF_LEVELS[i] = { id: l.id, name: l.name, short: l.short, skill: l.skill, depth: l.depth, movetime: l.movetime, blunderChance: l.blunder };
                });
            } catch (_) {}
        }

        if (typeof askStockfishBestMove === 'function') {
            root.askStockfishBestMove = askStockfishBestMove = function (fen) {
                return C.engine.ask(fen);
            };
        }
        if (typeof updateStockfishUI === 'function') {
            root.updateStockfishUI = updateStockfishUI = function () { C.ui.syncRival(); };
        }
        if (typeof cycleStockfishLevel === 'function') {
            root.cycleStockfishLevel = cycleStockfishLevel = function () {
                C.engine.setLevel((C.engine.idx + 1) % C.LEVELS.length, true);
            };
        }
        if (typeof scheduleOpponentIfNeeded === 'function') {
            const orig = scheduleOpponentIfNeeded;
            root.scheduleOpponentIfNeeded = scheduleOpponentIfNeeded = function () {
                if (C.sparring.active || C.fsrs.active) return;
                orig.apply(this, arguments);
            };
        }
        if (typeof handleMoveAttempt === 'function') {
            const origH = handleMoveAttempt;
            root.handleMoveAttempt = handleMoveAttempt = function (fr, fc, tr, tc) {
                if (C.fsrs.active) return C.fsrs.reviewMove(fr, fc, tr, tc);
                if (C.sparring.active) return C.sparring.onMove(fr, fc, tr, tc);
                return origH.apply(this, arguments);
            };
        }
        if (typeof updateUI === 'function') {
            const origU = updateUI;
            root.updateUI = updateUI = function () {
                origU.apply(this, arguments);
                C.ui.syncChip();
                C.ui.syncClock();
                if (C.sparring.active && !C.sparring.ended) {
                    if ($('mode-label')) $('mode-label').textContent = 'Sparring';
                    const n = chessGame ? Math.ceil(chessGame.history().length / 2) : 1;
                    if ($('level-indicator')) $('level-indicator').textContent = String(Math.max(1, n));
                    if ($('level-total')) $('level-total').textContent = '';
                    if (C.sparring.inBook && $('instruction-text') && chessGame) {
                        const exp = C.book.expectedSans(C.sparring.tree, chessGame.fen());
                        const mine = (userRole === 'w' && chessGame.turn() === 'w') || (userRole === 'b' && chessGame.turn() === 'b');
                        if (mine && exp.length) $('instruction-text').textContent = 'Sigue en el libro. Juega tu plan (el árbol admite: ' + exp.slice(0, 4).join(', ') + (exp.length > 4 ? '…' : '') + ').';
                    }
                }
            };
        }
        if (typeof backToMenu === 'function') {
            const origB = backToMenu;
            root.backToMenu = backToMenu = function () {
                C.sparring.stop();
                C.fsrs.stop();
                C.clock.stop();
                if (C.today.active) {
                    C.today.active = false;
                    C.today.phase = null;
                    C.ui.todayBar('');
                }
                origB.apply(this, arguments);
                C.ui.syncDue();
            };
        }
        if (typeof submitExamAnswer === 'function') {
            const origS = submitExamAnswer;
            root.submitExamAnswer = submitExamAnswer = function () {
                origS.apply(this, arguments);
                if (C.today.active && C.today.phase === 'exam') {
                    const again = $('exam-btn-again');
                    if (again) {
                        again.textContent = C.today.examLeft > 0 ? ('Siguiente (' + C.today.examLeft + ')') : 'Terminar Hoy';
                        again.onclick = () => {
                            if (C.today.examLeft > 0) C.today.nextExam();
                            else C.today.finish();
                        };
                    }
                }
            };
        }
        if (typeof ensureStockfish === 'function') {
            const origE = ensureStockfish;
            root.ensureStockfish = ensureStockfish = function () {
                return origE.apply(this, arguments).then((w) => {
                    applyEngineOptions(w, currentLevel());
                    return w;
                });
            };
        }
        if (typeof showOpeningFlyout === 'function') {
            const origF = showOpeningFlyout;
            root.showOpeningFlyout = showOpeningFlyout = function (op, anchor, fromTouch) {
                origF.apply(this, arguments);
                const fly = $('cat-flyout');
                if (!fly || fly.querySelector('.fly-sparring')) return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'fly-sparring';
                b.textContent = 'Sparring con esta apertura';
                b.onclick = (e) => {
                    e.stopPropagation();
                    if (typeof closeAllCatMenus === 'function') closeAllCatMenus();
                    C.sparring.start({
                        openingId: op.id,
                        color: userRole || 'w',
                        persona: storeGet(KEY.persona, 'club'),
                        clock: C.clock.mode
                    });
                };
                fly.insertBefore(b, fly.children[1] || null);
            };
        }
        if (typeof updateGameStatusBanner === 'function') {
            const origG = updateGameStatusBanner;
            root.updateGameStatusBanner = updateGameStatusBanner = function () {
                origG.apply(this, arguments);
                const el = $('game-status');
                if (!el || C.sparring.active || C.fsrs.active) return;
                if (freePlayMode && chessGame && !chessGame.game_over() && /Stockfish/.test(el.textContent || '')) {
                    const lv = currentLevel();
                    el.textContent = 'Partida libre vs ' + lv.name + '. En libro el rival sigue la teoría; fuera de libro usa este nivel.';
                }
            };
        }
    };

    C.boot = function () {
        C.installHooks();
        C.engine.loadSaved();
        C.clock.load();
        C.ui.injectHome();
        C.ui.injectCombat();
        C.ui.injectPanels();
        C.ui.syncDue();
        C.ui.syncQwen();
        C.qwen.probe();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
        }
    };
})(window);
