local config = require 'config.client'

AdminState = AdminState or {}
Actions = Actions or {}

local nuiReady = false
local panelMode = nil

local function setup()
    SendNUIMessage({
        action = 'setup',
        config = {
            accent = config.accentColor,
            gradient = config.gradientColors,
            brandName = config.brandName,
            brandSubtitle = config.brandSubtitle,
            brandLogo = config.brandLogo,
            sounds = config.sounds,
            fancyBackground = config.fancyBackground,
            categories = config.reportCategories,
        },
        locales = lib.getLocales(),
        lang = require 'config.shared'.locale or GetConvar('ox:locale', 'en'),
    })
end

function PushAdminState()
    SendNUIMessage({ action = 'state', state = AdminState })
end

function CloseAdminPanel()
    if not panelMode then return end
    panelMode = nil
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
end

local function openPanel(mode, payload)
    if not nuiReady then setup() end
    panelMode = mode
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'open', mode = mode, data = payload, state = AdminState })
end

local function openAdminPanel()
    local data = lib.callback.await('qbx_admin:server:getPanelData', false)
    if not data then return end
    openPanel('admin', data)
end

function OpenReportWindow()
    openPanel('player', { me = { id = cache.serverId, name = GetPlayerName(cache.playerId) } })
end

RegisterNetEvent('qbx_admin:client:openMenu', function()
    if GetInvokingResource() then return end
    if panelMode == 'admin' then return CloseAdminPanel() end
    openAdminPanel()
end)

RegisterNetEvent('qbx_admin:client:setModel', function(skin)
    local model = joaat(skin)
    SetEntityInvincible(cache.ped, true)
    if IsModelInCdimage(model) and IsModelValid(model) then
        lib.requestModel(model)
        SetPlayerModel(cache.playerId, model)
        SetPedRandomComponentVariation(cache.ped, 1)
        SetModelAsNoLongerNeeded(model)
    end
    SetEntityInvincible(cache.ped, false)
end)

RegisterNUICallback('ready', function(_, cb)
    nuiReady = true
    setup()
    cb(true)
end)

RegisterNUICallback('close', function(_, cb)
    panelMode = nil
    SetNuiFocus(false, false)
    cb(true)
end)

RegisterNUICallback('action', function(data, cb)
    local handler = Actions[data and data.name]
    if not handler then return cb({ error = 'unknown action' }) end

    if panelMode ~= 'admin' and not tostring(data.name):find('^my:') and data.name ~= 'typing' then
        return cb({ error = 'not allowed' })
    end

    local ok, res = pcall(handler, data.payload)
    if not ok then
        lib.print.error(res)
        return cb({ error = locale('ui.err_generic') })
    end
    cb(res == nil and true or res)
end)

RegisterNUICallback('refresh', function(_, cb)
    cb(lib.callback.await('qbx_admin:server:getPanelData', false) or false)
end)

if config.openKey then
    lib.addKeybind({
        name = 'qbx_adminmenu_open',
        description = 'Open admin panel',
        defaultKey = config.openKey,
        onPressed = function() ExecuteCommand('admin') end,
    })
end

if config.reportKey then
    lib.addKeybind({
        name = 'qbx_adminmenu_report',
        description = 'Open report window',
        defaultKey = config.reportKey,
        onPressed = function() OpenReportWindow() end,
    })
end

AddEventHandler('onResourceStop', function(resource)
    if resource ~= cache.resource then return end
    if panelMode then SetNuiFocus(false, false) end
end)
