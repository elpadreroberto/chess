/* FSRS-4.5 compacto (ts-fsrs defaults). rating: 1 Again, 2 Hard, 3 Good, 4 Easy */
(function (root) {
    const W = [
        0.4072, 1.1829, 3.173, 15.4722, 7.2102, 0.5316, 0.8612, 0.0362,
        1.581, 0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407,
        2.9466, 0.5034, 0.6567
    ];
    const DECAY = -0.5;
    const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
    const MIN_S = 0.1;

    function clampD(d) { return Math.min(10, Math.max(1, d)); }
    function toDays(ms) { return ms / 86400000; }

    function retrievability(s, elapsedDays) {
        return Math.pow(1 + FACTOR * elapsedDays / Math.max(s, MIN_S), DECAY);
    }

    function initS(g) {
        return Math.max(MIN_S, W[g - 1]);
    }

    function initD(g) {
        return clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1);
    }

    function nextD(d, g) {
        const delta = -W[6] * (g - 3);
        return clampD(d + delta * ((10 - d) / 9));
    }

    function nextSSuccess(s, d, r, g) {
        const hardPen = g === 2 ? W[15] : 1;
        const easyB = g === 4 ? W[16] : 1;
        const t = Math.exp(W[8]) *
            (11 - d) *
            Math.pow(s, -W[9]) *
            (Math.exp((1 - r) * W[10]) - 1) *
            hardPen *
            easyB;
        return Math.max(MIN_S, s * (1 + t));
    }

    function nextSFail(d, s, r) {
        return Math.max(
            MIN_S,
            W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14])
        );
    }

    function intervalDays(s, requestRetention) {
        const rr = requestRetention || 0.9;
        return Math.min(36500, Math.max(1, Math.round(s / FACTOR * (Math.pow(rr, 1 / DECAY) - 1))));
    }

    function newCard(now) {
        const t = now || Date.now();
        return {
            due: t,
            stability: 0,
            difficulty: 0,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            state: 0, /* 0 new, 1 learning, 2 review, 3 relearning */
            last_review: null
        };
    }

    function review(card, rating, now) {
        const t = now || Date.now();
        const c = Object.assign({}, card);
        const last = c.last_review || t;
        const elapsed = c.last_review ? Math.max(0, toDays(t - last)) : 0;
        c.elapsed_days = elapsed;

        let s = c.stability;
        let d = c.difficulty;
        const r = s > 0 ? retrievability(s, elapsed) : 0;

        if (c.state === 0 || !c.last_review) {
            d = initD(rating);
            s = initS(rating);
            c.state = rating === 1 ? 3 : (rating === 4 ? 2 : 1);
        } else if (rating === 1) {
            d = nextD(d, 1);
            s = nextSFail(d, s, r);
            c.lapses += 1;
            c.state = 3;
        } else {
            d = nextD(d, rating);
            s = nextSSuccess(s, d, r, rating);
            c.state = 2;
        }

        c.stability = s;
        c.difficulty = d;
        c.reps += 1;
        c.last_review = t;

        let days;
        if (rating === 1) days = 0.0104; /* ~15 min */
        else if (c.state === 1 && rating === 2) days = 0.0417; /* 1 h */
        else if (c.state === 1 && rating === 3) days = 1;
        else days = intervalDays(s, 0.9);

        if (rating === 4) days = Math.max(days, 4);
        c.scheduled_days = days;
        c.due = t + days * 86400000;
        return c;
    }

    function isDue(card, now) {
        const t = now || Date.now();
        return !card || !card.due || card.due <= t;
    }

    root.FSRS = { newCard, review, isDue, intervalDays };
})(window);
