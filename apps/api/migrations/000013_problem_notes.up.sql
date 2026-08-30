-- What the user learned from a problem, in their own words.
--
-- Per user, unlike everything else on a problem: problems are a shared library with no
-- owner (see 000011 for the same reasoning about registrations), and "I forgot the
-- overflow" is not a fact about the problem, it is a fact about one person's attempt at
-- it. Keyed on problems.id rather than the provider ref so a note survives a resync.
CREATE TABLE IF NOT EXISTS problem_notes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    body       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One note per problem per user: the editor upserts, it does not append.
    CONSTRAINT uq_problem_note_user_problem UNIQUE (user_id, problem_id)
);

-- The problem page asks for exactly one note, by both keys, which the unique index
-- above already serves. This one is for the reverse question — "everything I have
-- written down" — which a review list would ask.
CREATE INDEX IF NOT EXISTS idx_problem_notes_user ON problem_notes (user_id, updated_at DESC);
