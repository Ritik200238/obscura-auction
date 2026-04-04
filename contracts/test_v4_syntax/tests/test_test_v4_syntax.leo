// The 'test_test_v4_syntax' test program.
import test_v4_syntax.aleo;
program test_test_v4_syntax.aleo {
    @test
    @should_fail
    fn test_main_fails() {
        let result: u32 = test_v4_syntax.aleo::main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    constructor() {}
}
