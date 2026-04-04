// Minimal CPI test — settle program that consumes core's record
import test_cpi_core.aleo;

program test_cpi_settle.aleo {
    @noupgrade
    async constructor() {}

    record EscrowReceipt {
        owner: address,
        auction_id: field,
        escrowed_amount: u128,
    }

    mapping escrow_total: field => u128;

    // This transition accepts a record created by test_cpi_core.aleo
    // If CPI works, this compiles and we can consume cross-program records
    async transition reveal_bid(
        bid: test_cpi_core.aleo/TestBid,
    ) -> (EscrowReceipt, Future) {
        let receipt: EscrowReceipt = EscrowReceipt {
            owner: bid.owner,
            auction_id: bid.auction_id,
            escrowed_amount: bid.amount,
        };
        return (receipt, finalize_reveal_bid(bid.auction_id, bid.amount));
    }

    async function finalize_reveal_bid(auction_id: field, amount: u128) {
        let total: u128 = escrow_total.get_or_use(auction_id, 0u128);
        escrow_total.set(auction_id, total + amount);
    }
}
