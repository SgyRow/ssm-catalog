from papermerge.core.features.auth.scopes import Scopes


def test_portal_scopes_declared():
    all_s = Scopes.all_scopes()
    assert Scopes.COMMANDER_VIEW in all_s
    assert Scopes.PORTAL_VIEW in all_s
    assert Scopes.PORTAL_FEED_VIEW in all_s
    assert Scopes.PORTAL_FEED_MANAGE in all_s
    assert Scopes.PORTAL_SECTION_CREATE in all_s
