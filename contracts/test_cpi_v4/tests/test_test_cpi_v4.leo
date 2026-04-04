// The 'test_test_cpi_v4' test program.
import test_cpi_v4.aleo;
program test_test_cpi_v4.aleo {
    @test
    @should_fail
    fn test_main_fails() {
        let result: u32 = test_cpi_v4.aleo::main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    constructor() {}
}
