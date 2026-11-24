// Readalong: patched copy of turso_ext 0.6.1. Upstream checks `cfg!(target_os)`,
// which in a build script is the HOST OS, so cross-compiling for Android on a
// Windows PC linked the Windows-only advapi32 and failed. Check the target.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-lib=advapi32");
    }
}
