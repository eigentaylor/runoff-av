// Shared logic for Approval Runoff Strategy Tools
// Based on Fishburn & Brams (1981) "Approval Voting, Condorcet's Principle, and Runoff Elections"

/**
 * Global setting for voting mode: 'runoff' or 'approval'
 * When 'approval', we skip the runoff and just use first-round winners
 */
let votingMode = 'runoff';

/**
 * Configuration: whether abstaining (empty ballot) counts as a sincere strategy
 */
let abstentionIsSincere = false;

/**
 * Set the voting mode
 */
function setVotingMode(mode) {
    votingMode = mode;

    // Update button states directly for immediate feedback
    const runoffBtn = document.getElementById('mode-runoff');
    const approvalBtn = document.getElementById('mode-approval');
    if (runoffBtn && approvalBtn) {
        if (mode === 'approval') {
            console.log('Setting mode to approval');
            runoffBtn.classList.remove('active');
            approvalBtn.classList.add('active');
        } else {
            console.log('Setting mode to runoff');
            runoffBtn.classList.add('active');
            approvalBtn.classList.remove('active');
        }
    }

    // Dispatch event so pages can react
    window.dispatchEvent(new CustomEvent('votingModeChanged', { detail: { mode } }));
}

/**
 * Get the current voting mode
 */
function getVotingMode() {
    return votingMode;
}

/**
 * Parse a preference string like "A>B>C" into an array
 */
function parsePreference(prefString) {
    const parts = prefString.split('>').map(s => s.trim()).filter(s => s.length > 0);
    return parts;
}

/**
 * Generate all possible approval ballots for a set of candidates
 * Includes abstention (empty ballot) but excludes voting for everyone (equivalent to abstention)
 */
function generateAllBallots(candidates) {
    const ballots = [[]]; // Start with abstention
    const n = candidates.length;

    // Generate all non-empty subsets EXCEPT the full set (which equals abstention)
    for (let i = 1; i < Math.pow(2, n) - 1; i++) {
        const ballot = [];
        for (let j = 0; j < n; j++) {
            if (i & (1 << j)) {
                ballot.push(candidates[j]);
            }
        }
        ballots.push(ballot);
    }

    return ballots;
}

/**
 * Determine who wins in a runoff between two candidates
 */
function getRunoffWinner(c1, c2, matchups) {
    const key1 = `${c1}-${c2}`;
    const key2 = `${c2}-${c1}`;

    if (matchups[key1]) {
        return c1;
    } else if (matchups[key2]) {
        return c2;
    } else {
        // Tie or undefined - return null to indicate ambiguity
        return null;
    }
}

/**
 * Compute the ordinary approval voting outcome (no runoff)
 * Simply returns the candidate(s) with the highest vote count
 * @param {Object} baseVotes - Vote counts for each candidate (before focal voter)
 * @param {Array} ballot - The ballot (array of candidates approved)
 * @returns {Object} Outcome with Gamma (winners = highest vote-getters)
 */
function computeApprovalOutcome(baseVotes, ballot) {
    // Add focal voter's vote
    const votes = { ...baseVotes };
    ballot.forEach(c => {
        votes[c] = (votes[c] || 0) + 1;
    });

    // Sort candidates by votes
    const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    const maxVotes = sorted[0][1];

    // Winners are all candidates tied for the highest vote count
    const winners = sorted.filter(([c, v]) => v === maxVotes).map(([c, v]) => c);

    return {
        A: winners,
        B: [],
        possibleRunoffs: [],
        Gamma: winners,
        votes: votes,
        isApprovalMode: true
    };
}

/**
 * Compute the runoff outcome for a given scenario and ballot
 * @param {Object} baseVotes - Vote counts for each candidate (before focal voter)
 * @param {Object} matchups - Head-to-head matchup results
 * @param {Array} ballot - The ballot (array of candidates approved)
 * @param {Array} candidates - All candidates
 * @param {boolean} forceRunoff - If true, always use runoff mode regardless of global setting
 * @returns {Object} Outcome with Gamma (possible winners), runoff details, etc.
 */
function computeRunoffOutcome(baseVotes, matchups, ballot, candidates, forceRunoff = false) {
    // If in approval mode (and not forced to runoff), use simple approval voting
    if (!forceRunoff && votingMode === 'approval') {
        return computeApprovalOutcome(baseVotes, ballot);
    }

    // Add focal voter's vote
    const votes = { ...baseVotes };
    ballot.forEach(c => {
        votes[c] = (votes[c] || 0) + 1;
    });

    // Sort candidates by votes
    const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);

    // Determine who's guaranteed in runoff (set A) and who has a chance (set B)
    const maxVotes = sorted[0][1];
    const secondMaxVotes = sorted.find(([c, v]) => v < maxVotes)?.[1] || 0;

    const A = []; // Guaranteed in runoff
    const B = []; // Has a chance

    // Count candidates at each vote level
    const topTier = sorted.filter(([c, v]) => v === maxVotes).map(([c, v]) => c);
    const secondTier = sorted.filter(([c, v]) => v === secondMaxVotes).map(([c, v]) => c);

    if (topTier.length >= 2) {
        // Multiple candidates tied for first - all have a chance
        B.push(...topTier);
    } else if (topTier.length === 1) {
        // One candidate in first
        A.push(topTier[0]);
        if (secondTier.length >= 1) {
            B.push(...secondTier);
        }
    }

    // Generate all possible runoff pairings
    const possibleRunoffs = [];

    if (A.length === 2) {
        possibleRunoffs.push([A[0], A[1]]);
    } else if (A.length === 1) {
        B.forEach(b => {
            possibleRunoffs.push([A[0], b]);
        });
    } else if (A.length === 0 && B.length >= 2) {
        for (let i = 0; i < B.length; i++) {
            for (let j = i + 1; j < B.length; j++) {
                possibleRunoffs.push([B[i], B[j]]);
            }
        }
    }

    // Compute Γ(>) = set of all candidates who could win
    const possibleWinners = new Set();
    const runoffDetails = [];

    possibleRunoffs.forEach(([c1, c2]) => {
        const winner = getRunoffWinner(c1, c2, matchups);
        if (winner) {
            possibleWinners.add(winner);
        } else {
            // If no winner defined, both could win
            possibleWinners.add(c1);
            possibleWinners.add(c2);
        }
        runoffDetails.push({
            pair: [c1, c2],
            winner: winner
        });
    });

    return {
        A: A,
        B: B,
        possibleRunoffs: runoffDetails,
        Gamma: Array.from(possibleWinners),
        votes: votes
    };
}

/**
 * Compare two outcomes using the voter's preference
 * Returns: 1 if outcome1 better, -1 if outcome2 better, 0 if equal/unclear
 */
function compareOutcomes(outcome1, outcome2, preference) {
    const Gamma1 = outcome1.Gamma;
    const Gamma2 = outcome2.Gamma;

    if (arraysEqualUnordered(Gamma1, Gamma2)) {
        return 0;
    }

    // Axiom P2: If Γ₁(>) = {x} and Γ₂(>) = {x,y}
    if (Gamma1.length === 1 && Gamma2.length === 2) {
        const x = Gamma1[0];
        if (Gamma2.includes(x)) {
            const y = Gamma2.find(c => c !== x);
            const xIndex = preference.indexOf(x);
            const yIndex = preference.indexOf(y);
            if (xIndex < yIndex) {
                return 1; // outcome1 better (certain good beats uncertain)
            } else {
                return -1; // outcome2 better (chance at better beats certain worse)
            }
        }
    }

    // Symmetric case
    if (Gamma2.length === 1 && Gamma1.length === 2) {
        const x = Gamma2[0];
        if (Gamma1.includes(x)) {
            const y = Gamma1.find(c => c !== x);
            const xIndex = preference.indexOf(x);
            const yIndex = preference.indexOf(y);
            if (xIndex < yIndex) {
                return -1;
            } else {
                return 1;
            }
        }
    }

    // General case: compare best possible outcomes
    const best1 = Math.min(...Gamma1.map(c => preference.indexOf(c)));
    const best2 = Math.min(...Gamma2.map(c => preference.indexOf(c)));

    if (best1 < best2) {
        return 1;
    } else if (best2 < best1) {
        return -1;
    }

    // If best cases equal, compare worst cases
    const worst1 = Math.max(...Gamma1.map(c => preference.indexOf(c)));
    const worst2 = Math.max(...Gamma2.map(c => preference.indexOf(c)));

    if (worst1 < worst2) {
        return 1;
    } else if (worst2 < worst1) {
        return -1;
    }

    return 0;
}

/**
 * Check if two arrays are equal (order matters)
 */
function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, i) => val === sortedB[i]);
}

/**
 * Check if two arrays are equal (order doesn't matter)
 */
function arraysEqualUnordered(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, i) => val === sortedB[i]);
}

/**
 * Format a ballot for display
 */
function formatBallot(ballot) {
    return ballot.length === 0 ? '∅ (abstain)' : `{${ballot.join(', ')}}`;
}

/**
 * Format a Gamma set (possible winners) for display
 */
function formatGamma(gamma) {
    if (!gamma || gamma.length === 0) {
        return 'undefined';
    }
    if (gamma.length === 1) {
        return gamma[0];
    }
    return `{${gamma.join(', ')}}`;
}

/**
 * Check if a ballot is "sincere" given a preference order
 * A sincere ballot approves a prefix of the preference order
 * (i.e., approves top k candidates for some k)
 */
function isSincereBallot(ballot, preference) {
    if (ballot.length === 0) return abstentionIsSincere; // Abstention sincerity is configurable

    // Find the lowest-ranked approved candidate
    let lowestApprovedRank = -1;
    for (const c of ballot) {
        const rank = preference.indexOf(c);
        if (rank > lowestApprovedRank) {
            lowestApprovedRank = rank;
        }
    }

    // Check if all candidates ranked above the lowest are also approved
    for (let i = 0; i <= lowestApprovedRank; i++) {
        if (!ballot.includes(preference[i])) {
            return false;
        }
    }

    return true;
}

/**
 * Get the Gamma key for grouping (sorted string representation)
 */
function getGammaKey(gamma) {
    return [...gamma].sort().join(',');
}

/**
 * Rank comparison for outcomes based on preference
 * Lower is better
 */
function getOutcomeRank(gamma, preference) {
    if (gamma.length === 0) return Infinity;

    // Best possible winner rank
    const bestRank = Math.min(...gamma.map(c => preference.indexOf(c)));
    // Worst possible winner rank
    const worstRank = Math.max(...gamma.map(c => preference.indexOf(c)));
    // Uncertainty penalty
    const uncertainty = gamma.length - 1;

    // Primary: best rank, Secondary: worst rank, Tertiary: uncertainty
    return bestRank * 1000 + worstRank * 10 + uncertainty;
}

/**
 * Vote tier constants
 */
const VOTE_TIERS = {
    FRONTRUNNER: 100,
    VIABLE: 99,
    NONVIABLE: 10
};

// Export for use in modules (if using module system)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parsePreference,
        generateAllBallots,
        getRunoffWinner,
        computeRunoffOutcome,
        computeApprovalOutcome,
        compareOutcomes,
        arraysEqual,
        arraysEqualUnordered,
        formatBallot,
        formatGamma,
        isSincereBallot,
        getGammaKey,
        getOutcomeRank,
        VOTE_TIERS,
        setVotingMode,
        getVotingMode,
        abstentionIsSincere
    };
}
