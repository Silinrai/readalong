__license__ = 'AGPL v3'
__copyright__ = '2026, Bilingify LLC'

from calibre.customize import InterfaceActionBase

try:
    load_translations()
except NameError:
    pass

PLUGIN_VERSION = (0, 12, 12)


class ReadalongPlugin(InterfaceActionBase):
    name = 'Readalong Sync'
    description = _(
        'Push selected books and their metadata into your Readalong cloud library. '
        'Re-pushing a book updates its existing entry instead of creating a duplicate.'
    )
    supported_platforms = ['windows', 'osx', 'linux']
    author = 'Bilingify LLC'
    version = PLUGIN_VERSION
    minimum_calibre_version = (6, 0, 0)

    actual_plugin = 'calibre_plugins.readalong.ui:ReadalongInterfacePlugin'

    def is_customizable(self):
        return True

    def config_widget(self):
        from calibre_plugins.readalong.config import ConfigWidget

        return ConfigWidget()

    def save_settings(self, config_widget):
        config_widget.save_settings()
