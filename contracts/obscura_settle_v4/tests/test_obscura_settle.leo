// The 'test_obscura_settle' test program.
import obscura_settle.aleo;
program test_obscura_settle.aleo {
    @test
    script test_it() {
        let result: u32 = obscura_settle.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = obscura_settle.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
