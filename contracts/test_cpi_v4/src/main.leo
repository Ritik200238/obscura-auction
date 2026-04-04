// Test: Does Leo 4.0.0 still accept async transition + Future syntax?
import credits.aleo;

program test_cpi_v4.aleo {
    @noupgrade
    async constructor() {}

    mapping test_balance: u8 => u128;

    async transition test_cpi(
        private credits_in: credits.aleo/credits,
        private amount: u64
    ) -> (credits.aleo/credits, Future) {
        let (change, transfer_future): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in,
                self.address,
                amount
            );
        let amount_u128: u128 = amount as u128;
        return (change, finalize_test_cpi(transfer_future, amount_u128));
    }

    async function finalize_test_cpi(f0: Future, amount: u128) {
        f0.await();
        let bal: u128 = test_balance.get_or_use(0u8, 0u128);
        test_balance.set(0u8, bal + amount);
    }
}
