return {
    -- Main accent colour of the panel (hex). Every gradient, glow and highlight is derived from it.
    accentColor = '#8b5cf6',

    -- Extra colours used in the animated gradients. Leave nil to auto-generate them from accentColor.
    gradientColors = nil, -- e.g. { '#8b5cf6', '#ec4899', '#06b6d4' }

    -- Panel title / subtitle shown in the sidebar header
    brandName = 'QBOX',
    brandSubtitle = 'Admin Panel',

    -- Optional server logo shown in the top-left box instead of the shield icon (any image URL, square works best).
    -- Leave nil to keep the default animated icon. e.g. 'https://r2.fivemanage.com/xxx/logo.png'
    brandLogo = nil,

    -- Optional key to open the admin panel (players can rebind it in GTA settings). Set to false to disable.
    openKey = 'F10',

    -- Optional key for players to open their report window. Set to false to disable.
    reportKey = false,

    -- Play little UI sounds (hover / click / notifications)
    sounds = true,

    -- Animated background particles + floating orbs inside the panel
    fancyBackground = true,

    -- Report categories players can choose from (id must be unique, icon = Font Awesome class)
    reportCategories = {
        { id = 'general', label = 'General', icon = 'fa-solid fa-circle-question', color = '#60a5fa' },
        { id = 'player',  label = 'Player Report', icon = 'fa-solid fa-user-shield', color = '#f87171' },
        { id = 'bug',     label = 'Bug', icon = 'fa-solid fa-bug', color = '#fbbf24' },
        { id = 'stuck',   label = 'Stuck / Help', icon = 'fa-solid fa-life-ring', color = '#34d399' },
        { id = 'other',   label = 'Other', icon = 'fa-solid fa-ellipsis', color = '#c084fc' },
    },
}
