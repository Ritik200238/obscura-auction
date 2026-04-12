// The 'test_obscura_settle_stable' test program.
import obscura_settle_stable.aleo;
program test_obscura_settle_stable.aleo {
    @test
    @should_fail
    fn test_main_fails() {
        let result: u32 = obscura_settle_stable.aleo::main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    constructor() {}
}
