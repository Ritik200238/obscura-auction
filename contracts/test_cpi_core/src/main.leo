// Minimal CPI test — core program that creates a record
program test_cpi_core.aleo {
    @noupgrade
    async constructor() {}

    record TestBid {
        owner: address,
        auction_id: field,
        amount: u128,
    }

    mapping bid_count: field => u64;

    async transition create_bid(auction_id: field, amount: u128) -> (TestBid, Future) {
        let bid: TestBid = TestBid {
            owner: self.caller,
            auction_id: auction_id,
            amount: amount,
        };
        return (bid, finalize_create_bid(auction_id));
    }

    async function finalize_create_bid(auction_id: field) {
        let count: u64 = bid_count.get_or_use(auction_id, 0u64);
        bid_count.set(auction_id, count + 1u64);
    }
}
