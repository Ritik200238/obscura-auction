program test_v4_syntax.aleo {
    @noupgrade
    constructor() {}

    record TestRecord {
        owner: address,
        amount: u128,
    }

    mapping balances: field => u128;

    fn create_record(amount: u128) -> (TestRecord, Final) {
        let rec: TestRecord = TestRecord {
            owner: self.caller,
            amount: amount,
        };
        let caller_field: field = self.caller as field;
        let caller_hash: field = BHP256::hash_to_field(caller_field);
        return (rec, final {
            let current: u128 = balances.get_or_use(caller_hash, 0u128);
            balances.set(caller_hash, current + amount);
        });
    }
}
