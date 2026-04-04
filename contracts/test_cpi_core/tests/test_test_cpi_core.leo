// The 'test_test_cpi_core' test program.
import test_cpi_core.aleo;
program test_test_cpi_core.aleo {
    @test
    script test_it() {
        let result: u32 = test_cpi_core.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = test_cpi_core.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
