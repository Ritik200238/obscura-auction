// The 'test_test_cpi_settle' test program.
import test_cpi_settle.aleo;
program test_test_cpi_settle.aleo {
    @test
    script test_it() {
        let result: u32 = test_cpi_settle.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = test_cpi_settle.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
