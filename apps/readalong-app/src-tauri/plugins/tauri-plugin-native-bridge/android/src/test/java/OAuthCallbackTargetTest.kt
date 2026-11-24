package dev.readalong.native_bridge

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OAuthCallbackTargetTest {
    @Test
    fun oneDriveCallback_acceptsProviderRootSlash() {
        val target = OAuthCallbackTarget.parse("readalong-onedrive://auth")

        assertNotNull(target)
        assertTrue(
            target!!.matches("readalong-onedrive://auth/?code=CODE&state=STATE"),
        )
    }

    @Test
    fun oneDriveCallback_rejectsWrongHost() {
        val target = OAuthCallbackTarget.parse("readalong-onedrive://auth")

        assertNotNull(target)
        assertFalse(
            target!!.matches("readalong-onedrive://attacker/?code=CODE&state=STATE"),
        )
        assertFalse(
            target.matches("readalong-onedrive://auth:1234/?code=CODE&state=STATE"),
        )
    }

    @Test
    fun googleCallback_requiresItsRegisteredPath() {
        val target = OAuthCallbackTarget.parse(
            "com.googleusercontent.apps.cid:/oauthredirect",
        )

        assertNotNull(target)
        assertTrue(
            target!!.matches(
                "com.googleusercontent.apps.cid:/oauthredirect?code=CODE&state=STATE",
            ),
        )
        assertFalse(
            target.matches(
                "com.googleusercontent.apps.cid:/other?code=CODE&state=STATE",
            ),
        )
    }

    @Test
    fun supabaseCallback_requiresItsRegisteredHost() {
        val target = OAuthCallbackTarget.parse("readalong://auth-callback")

        assertNotNull(target)
        assertTrue(target!!.matches("readalong://auth-callback#access_token=TOKEN"))
        assertFalse(target.matches("readalong://other#access_token=TOKEN"))
    }

    @Test
    fun invalidCallbackUrl_isRejected() {
        assertTrue(OAuthCallbackTarget.parse("not a URI") == null)
    }
}
