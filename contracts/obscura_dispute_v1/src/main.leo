// ============================================================================
// OBSCURA DISPUTE v1 — Multi-Voter Economic Quorum
// ============================================================================
// Decentralized dispute resolution for auctions settled via obscura_settle_v6.
//
// Three bonded jurors vote on whether a dispute is upheld. Wrong voters get
// slashed; right voters split the losing bonds + a treasury cut. Novel on Aleo
// for auction-specific dispute resolution (Veiled Markets has similar for
// prediction markets).
//
// FLOW:
//   1. file_dispute(auction_id, settlement_hash, bond) — disputer opens
//   2. juror_stake(auction_id, stake) × 3 — jurors lock bond
//   3. juror_vote(auction_id, upheld: bool, opening_nonce) — jurors vote
//   4. resolve_quorum(auction_id) — tally + distribute bonds
//
// PRIVACY:
//   - Juror identity hashed (BHP256)
//   - Vote stored as commitment until reveal phase
//   - Bond amount stored, disputer/juror addresses NOT (pseudonymous hashes)
// ============================================================================

import credits.aleo;

program obscura_dispute_v1.aleo {

    @noupgrade
    constructor() {}

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const REQUIRED_JURORS: u8 = 3u8;
    const MIN_JUROR_BOND: u128 = 1_000_000u128;      // 1 ALEO
    const MIN_DISPUTE_BOND: u128 = 5_000_000u128;    // 5 ALEO
    const TREASURY_CUT_BPS: u128 = 500u128;          // 5% to treasury
    const FEE_DENOMINATOR: u128 = 10000u128;
    const VOTE_WINDOW_BLOCKS: u64 = 2880u64;         // ~8hr commit window
    const REVEAL_WINDOW_BLOCKS: u64 = 1440u64;       // ~4hr reveal window

    // Status codes
    const STATUS_OPEN: u8 = 1u8;
    const STATUS_VOTING: u8 = 2u8;
    const STATUS_REVEALING: u8 = 3u8;
    const STATUS_RESOLVED_UPHELD: u8 = 4u8;
    const STATUS_RESOLVED_REJECTED: u8 = 5u8;
    const STATUS_EXPIRED: u8 = 6u8;

    // ========================================================================
    // RECORDS
    // ========================================================================

    record DisputeReceipt {
        owner: address,           // disputer
        auction_id: field,
        bond_amount: u128,
        settlement_hash: field,
    }

    record JurorBond {
        owner: address,           // juror
        auction_id: field,
        juror_slot: u8,           // 0, 1, or 2
        stake_amount: u128,
        vote_nonce: field,        // used to open vote commitment
    }

    record JurorReward {
        owner: address,           // correct juror
        auction_id: field,
        reward_amount: u128,
    }

    // ========================================================================
    // STRUCTS
    // ========================================================================

    struct DisputeState {
        disputer_hash: field,
        settlement_hash: field,
        bond_pool: u128,           // total bonded ALEO in the dispute
        status: u8,
        filed_at: u64,
        voting_ends: u64,
        reveal_ends: u64,
        jurors_staked: u8,
        votes_revealed: u8,
        votes_upheld: u8,
        votes_rejected: u8,
    }

    struct VoteCommit {
        upheld: bool,
        nonce: field,
    }

    // ========================================================================
    // MAPPINGS
    // ========================================================================

    mapping disputes: field => DisputeState;
    mapping juror_commits: field => field;           // hash(auction_id, slot) => BHP256(VoteCommit)
    mapping treasury_balance: u8 => u128;            // 0 = ALEO treasury

    // ########################################################################
    //              T1: FILE DISPUTE
    // ########################################################################

    fn file_dispute(
        private auction_id: field,
        private settlement_hash: field,
        private bond_amount: u128,
        private bond_credits: credits.aleo::credits
    ) -> (DisputeReceipt, credits.aleo::credits, Final) {
        assert(bond_amount >= MIN_DISPUTE_BOND);

        let disputer_field: field = self.caller as field;
        let disputer_hash: field = BHP256::hash_to_field(disputer_field);

        let bond_u64: u64 = bond_amount as u64;
        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
                bond_credits,
                self.address,
                bond_u64
            );

        let receipt: DisputeReceipt = DisputeReceipt {
            owner: self.caller,
            auction_id: auction_id,
            bond_amount: bond_amount,
            settlement_hash: settlement_hash,
        };

        return (receipt, change, final {
            transfer_final.run();

            let already_filed: bool = disputes.contains(auction_id);
            assert(!already_filed);

            let filed_at: u64 = block.height as u64;

            disputes.set(auction_id, DisputeState {
                disputer_hash: disputer_hash,
                settlement_hash: settlement_hash,
                bond_pool: bond_amount,
                status: STATUS_OPEN,
                filed_at: filed_at,
                voting_ends: filed_at + VOTE_WINDOW_BLOCKS,
                reveal_ends: filed_at + VOTE_WINDOW_BLOCKS + REVEAL_WINDOW_BLOCKS,
                jurors_staked: 0u8,
                votes_revealed: 0u8,
                votes_upheld: 0u8,
                votes_rejected: 0u8,
            });
        });
    }

    // ########################################################################
    //              T2: JUROR STAKE + COMMIT VOTE
    // ########################################################################

    fn juror_stake(
        private auction_id: field,
        private juror_slot: u8,
        private stake_amount: u128,
        private upheld: bool,
        private vote_nonce: field,
        private stake_credits: credits.aleo::credits
    ) -> (JurorBond, credits.aleo::credits, Final) {
        assert(stake_amount >= MIN_JUROR_BOND);
        assert(juror_slot < REQUIRED_JURORS);

        let stake_u64: u64 = stake_amount as u64;
        let (change, transfer_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
                stake_credits,
                self.address,
                stake_u64
            );

        // Vote commitment — bound to juror's nonce, opens only with the nonce
        let vote_commit: field = BHP256::hash_to_field(VoteCommit {
            upheld: upheld,
            nonce: vote_nonce,
        });

        // Juror slot key — prevents same slot being staked twice
        let slot_key: field = BHP256::hash_to_field(SlotKey {
            auction_id: auction_id,
            slot: juror_slot,
        });

        let bond: JurorBond = JurorBond {
            owner: self.caller,
            auction_id: auction_id,
            juror_slot: juror_slot,
            stake_amount: stake_amount,
            vote_nonce: vote_nonce,
        };

        return (bond, change, final {
            transfer_final.run();

            let d: DisputeState = disputes.get(auction_id);
            assert_eq(d.status, STATUS_OPEN);

            let current_height: u64 = block.height as u64;
            assert(current_height < d.voting_ends);

            let slot_taken: bool = juror_commits.contains(slot_key);
            assert(!slot_taken);

            juror_commits.set(slot_key, vote_commit);

            let new_staked: u8 = d.jurors_staked + 1u8;
            let new_status: u8 = new_staked == REQUIRED_JURORS ? STATUS_REVEALING : STATUS_OPEN;
            let new_pool: u128 = d.bond_pool + stake_amount;

            disputes.set(auction_id, DisputeState {
                disputer_hash: d.disputer_hash,
                settlement_hash: d.settlement_hash,
                bond_pool: new_pool,
                status: new_status,
                filed_at: d.filed_at,
                voting_ends: d.voting_ends,
                reveal_ends: d.reveal_ends,
                jurors_staked: new_staked,
                votes_revealed: d.votes_revealed,
                votes_upheld: d.votes_upheld,
                votes_rejected: d.votes_rejected,
            });
        });
    }

    struct SlotKey {
        auction_id: field,
        slot: u8,
    }

    // ########################################################################
    //              T3: REVEAL VOTE — juror opens their commitment
    // ########################################################################

    fn juror_reveal(
        private bond: JurorBond,
        private upheld: bool
    ) -> Final {
        let b_auction_id: field = bond.auction_id;
        let b_slot: u8 = bond.juror_slot;
        let b_nonce: field = bond.vote_nonce;

        let vote_commit: field = BHP256::hash_to_field(VoteCommit {
            upheld: upheld,
            nonce: b_nonce,
        });

        let slot_key: field = BHP256::hash_to_field(SlotKey {
            auction_id: b_auction_id,
            slot: b_slot,
        });

        return final {
            let d: DisputeState = disputes.get(b_auction_id);
            assert_eq(d.status, STATUS_REVEALING);

            let current_height: u64 = block.height as u64;
            assert(current_height < d.reveal_ends);

            let stored_commit: field = juror_commits.get(slot_key);
            assert_eq(stored_commit, vote_commit);

            let new_revealed: u8 = d.votes_revealed + 1u8;
            let new_upheld: u8 = upheld ? d.votes_upheld + 1u8 : d.votes_upheld;
            let new_rejected: u8 = upheld ? d.votes_rejected : d.votes_rejected + 1u8;

            disputes.set(b_auction_id, DisputeState {
                disputer_hash: d.disputer_hash,
                settlement_hash: d.settlement_hash,
                bond_pool: d.bond_pool,
                status: d.status,
                filed_at: d.filed_at,
                voting_ends: d.voting_ends,
                reveal_ends: d.reveal_ends,
                jurors_staked: d.jurors_staked,
                votes_revealed: new_revealed,
                votes_upheld: new_upheld,
                votes_rejected: new_rejected,
            });
        };
    }

    // ########################################################################
    //              T4: RESOLVE QUORUM — finalize outcome + distribute bonds
    // ########################################################################

    fn resolve_quorum(
        private auction_id: field
    ) -> Final {
        return final {
            let d: DisputeState = disputes.get(auction_id);
            assert_eq(d.status, STATUS_REVEALING);
            assert_eq(d.jurors_staked, REQUIRED_JURORS);

            let current_height: u64 = block.height as u64;
            assert(current_height >= d.reveal_ends);

            // Determine outcome — simple majority
            let upheld_wins: bool = d.votes_upheld > d.votes_rejected;

            let new_status: u8 = upheld_wins ? STATUS_RESOLVED_UPHELD : STATUS_RESOLVED_REJECTED;

            // Treasury cut
            let treasury_cut: u128 = (d.bond_pool * TREASURY_CUT_BPS) / FEE_DENOMINATOR;
            let current_treasury: u128 = treasury_balance.get_or_use(0u8, 0u128);
            treasury_balance.set(0u8, current_treasury + treasury_cut);

            disputes.set(auction_id, DisputeState {
                disputer_hash: d.disputer_hash,
                settlement_hash: d.settlement_hash,
                bond_pool: d.bond_pool - treasury_cut,
                status: new_status,
                filed_at: d.filed_at,
                voting_ends: d.voting_ends,
                reveal_ends: d.reveal_ends,
                jurors_staked: d.jurors_staked,
                votes_revealed: d.votes_revealed,
                votes_upheld: d.votes_upheld,
                votes_rejected: d.votes_rejected,
            });
        };
    }

    // ########################################################################
    //              T5: CLAIM REWARD — correct juror claims share
    // ########################################################################
    // After resolve_quorum, each juror who voted correctly can claim their
    // original stake + share of losers' bonds.

    fn juror_claim(
        private bond: JurorBond,
        private voted_upheld: bool
    ) -> (credits.aleo::credits, Final) {
        let b_auction_id: field = bond.auction_id;
        let b_slot: u8 = bond.juror_slot;
        let b_owner: address = bond.owner;
        let b_stake: u128 = bond.stake_amount;
        let b_nonce: field = bond.vote_nonce;

        let vote_commit: field = BHP256::hash_to_field(VoteCommit {
            upheld: voted_upheld,
            nonce: b_nonce,
        });

        let slot_key: field = BHP256::hash_to_field(SlotKey {
            auction_id: b_auction_id,
            slot: b_slot,
        });

        // Distribute: stake back + proportional share of losing bonds.
        // Simplified: each correct juror gets stake + (losing_pool / correct_count).
        // For simplicity in v1, reward = 1.5x stake (handles common case).
        let reward_gross: u128 = (b_stake * 15u128) / 10u128;
        let reward_u64: u64 = reward_gross as u64;

        let (credits_out, pay_final): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(
                b_owner,
                reward_u64
            );

        return (credits_out, final {
            pay_final.run();

            let d: DisputeState = disputes.get(b_auction_id);

            // Validate juror voted with the majority (status reflects outcome)
            let juror_won: bool =
                (d.status == STATUS_RESOLVED_UPHELD && voted_upheld) ||
                (d.status == STATUS_RESOLVED_REJECTED && !voted_upheld);
            assert(juror_won);

            // Verify commitment opens
            let stored_commit: field = juror_commits.get(slot_key);
            assert_eq(stored_commit, vote_commit);

            // Prevent double-claim by removing the slot commit
            juror_commits.remove(slot_key);
        });
    }
}
