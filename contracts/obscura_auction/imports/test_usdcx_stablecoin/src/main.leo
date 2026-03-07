program test_usdcx_stablecoin.aleo {

    record Token {
        owner: address,
        amount: u128,
    }

    record ComplianceRecord {
        owner: address,
        compliance_hash: field,
    }

    struct MerkleProof {
        siblings: [field; 16],
        leaf_index: u32,
    }

    mapping account: address => u128;

    async transition transfer_public_as_signer(
        public receiver: address,
        public amount: u128
    ) -> Future {
        return finalize_transfer_public_as_signer(self.signer, receiver, amount);
    }

    async function finalize_transfer_public_as_signer(
        signer_addr: address,
        receiver: address,
        amount: u128
    ) {
        let sender_balance: u128 = account.get_or_use(signer_addr, 0u128);
        assert(sender_balance >= amount);
        account.set(signer_addr, sender_balance - amount);
        let receiver_balance: u128 = account.get_or_use(receiver, 0u128);
        account.set(receiver, receiver_balance + amount);
    }

    async transition transfer_public(
        public receiver: address,
        public amount: u128
    ) -> Future {
        return finalize_transfer_public(self.caller, receiver, amount);
    }

    async function finalize_transfer_public(
        sender: address,
        receiver: address,
        amount: u128
    ) {
        let sender_balance: u128 = account.get_or_use(sender, 0u128);
        assert(sender_balance >= amount);
        account.set(sender, sender_balance - amount);
        let receiver_balance: u128 = account.get_or_use(receiver, 0u128);
        account.set(receiver, receiver_balance + amount);
    }
}
