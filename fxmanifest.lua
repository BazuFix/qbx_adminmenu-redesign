fx_version 'cerulean'
game 'gta5'

description 'qbx_adminmenu redesign - NUI admin panel with reports/DM, bans, economy and more'
author 'BazuFix (original: Qbox-project)'
repository 'https://github.com/BazuFix/qbx_adminmenu-redesign'
version '1.0.1'

ox_lib 'locale'

shared_scripts {
    '@ox_lib/init.lua',
    '@qbx_core/modules/lib.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/_locale.lua',
    'server/main.lua',
    'server/reports.lua',
    'server/punish.lua',
    'server/peds.lua',
    'server/commands.lua',
}

client_scripts {
    'client/_locale.lua',
    'client/*.lua',
}

ui_page 'web/index.html'

files {
    'config/client.lua',
    'config/shared.lua',
    'locales/*.json',
    'web/index.html',
    'web/style.css',
    'web/app.js',
}

lua54 'yes'
use_experimental_fxv2_oal 'yes'
