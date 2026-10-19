Actions = Actions or {}

local dataFields = {
    name = true, food = true, thirst = true, stress = true, armor = true, phone = true,
    crafting = true, dealer = true, cash = true, bank = true, job = true, gang = true, radio = true,
}

local function target(data)
    local id = data and tonumber(data.id)
    if not id then return end
    return { id = id }
end

Actions['players:list'] = function()
    return lib.callback.await('qbx_admin:server:getPlayers', false) or {}
end

Actions['players:get'] = function(data)
    return lib.callback.await('qbx_admin:server:getPlayer', false, data and data.id)
end

Actions['players:general'] = function(data)
    local player = target(data)
    if not player or not tonumber(data.option) then return false end
    TriggerServerEvent('qbx_admin:server:playerOptionsGeneral', tonumber(data.option), player, data.input)
    return true
end

Actions['players:administration'] = function(data)
    local player = target(data)
    if not player or not tonumber(data.option) then return false end
    TriggerServerEvent('qbx_admin:server:playerAdministration', tonumber(data.option), player, data.input)
    return true
end

Actions['players:data'] = function(data)
    local player = target(data)
    if not player or not dataFields[data.field] or type(data.input) ~= 'table' then return false end
    TriggerServerEvent('qbx_admin:server:changePlayerData', data.field, player, data.input)
    return true
end

Actions['players:inventory'] = function(data)
    local player = target(data)
    if not player then return false end
    CloseAdminPanel()
    exports.ox_inventory:openInventory('player', player.id)
    return true
end

Actions['players:clothing'] = function(data)
    local player = target(data)
    if not player then return false end
    return lib.callback.await('qbx_admin:server:clothingMenu', false, player.id)
end

Actions['players:giveItem'] = function(data)
    local player = target(data)
    local amount = tonumber(data and data.amount)
    if not player or type(data.item) ~= 'string' or data.item == '' or not amount or amount < 1 then return false end
    ExecuteCommand(('giveitem %s %s %s'):format(player.id, data.item, math.floor(amount)))
    return true
end

Actions['players:mute'] = function(data)
    local player = target(data)
    if not player then return false end
    exports['pma-voice']:toggleMutePlayer(player.id)
    return true
end

Actions['players:spectate'] = function(data)
    local player = target(data)
    if not player then return false end
    CloseAdminPanel()
    ToggleSpectate(player.id)
    return true
end

RegisterNetEvent('qbx_admin:client:killPlayer', function()
    SetEntityHealth(cache.ped, 0)
end)

local spectating = false
function ToggleSpectate(serverId)
    if spectating then spectating = false return end

    local playerId = GetPlayerFromServerId(serverId)
    if playerId == -1 then
        exports.qbx_core:Notify(locale('ui.err_far'), 'error')
        return
    end

    spectating = true
    CreateThread(function()
        local cam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
        RenderScriptCams(true, true, 600, true, true)
        while spectating do
            local ped = GetPlayerPed(playerId)
            if not DoesEntityExist(ped) then break end
            local pos = GetOffsetFromEntityInWorldCoords(ped, 0.0, -4.5, 1.6)
            SetCamCoord(cam, pos.x, pos.y, pos.z)
            PointCamAtEntity(cam, ped, 0.0, 0.0, 0.4, true)
            SetFocusPosAndVel(pos.x, pos.y, pos.z, 0.0, 0.0, 0.0)
            qbx.drawText2d({ text = locale('ui.spectate_hint'), coords = vec2(0.5, 0.93), scale = 0.4, font = 4 })
            if IsControlJustPressed(0, 177) then spectating = false end
            Wait(0)
        end
        spectating = false
        ClearFocus()
        RenderScriptCams(false, true, 600, true, true)
        DestroyCam(cam, false)
    end)
end

local function result(ok, data)
    if ok then return data == nil and true or data end
    return { error = data and locale(data) or locale('ui.err_generic') }
end

Actions['players:ckLookup'] = function(data)
    return result(lib.callback.await('qbx_admin:server:ckLookup', false, data and data.target))
end

Actions['players:ckExecute'] = function(data)
    return result(lib.callback.await('qbx_admin:server:ckExecute', false, data and data.citizenid))
end

Actions['bans:list'] = function()
    return result(lib.callback.await('qbx_admin:server:getBans', false))
end

Actions['bans:unban'] = function(data)
    return result(lib.callback.await('qbx_admin:server:unban', false, data and data.id))
end

Actions['offline:list'] = function(data)
    return result(lib.callback.await('qbx_admin:server:getOfflinePlayers', false, data and data.search))
end

Actions['offline:get'] = function(data)
    return result(lib.callback.await('qbx_admin:server:getOfflinePlayer', false, data and data.citizenid))
end

Actions['offline:money'] = function(data)
    return result(lib.callback.await('qbx_admin:server:offlineSetMoney', false, data.citizenid, data.type, data.amount))
end

Actions['offline:ban'] = function(data)
    return result(lib.callback.await('qbx_admin:server:offlineBan', false, data.citizenid, data))
end

Actions['peds:list'] = function()
    return result(lib.callback.await('qbx_admin:server:getPedList', false))
end

Actions['peds:give'] = function(data)
    return result(lib.callback.await('qbx_admin:server:givePed', false, data.id, data.model, data.persistent))
end

local function isValidPed(model)
    local hash = joaat(model)
    return IsModelInCdimage(hash) and IsModelValid(hash) and IsModelAPed(hash), hash
end

lib.callback.register('qbx_admin:client:applyPed', function(model, persistent)
    local valid, hash = isValidPed(model)
    if not valid then return false end

    local ok = pcall(lib.requestModel, hash, 10000)
    if not ok then return false end

    local oldPed = cache.ped
    local health, armour = GetEntityHealth(oldPed), GetPedArmour(oldPed)

    SetPlayerModel(cache.playerId, hash)
    SetModelAsNoLongerNeeded(hash)

    local ped = PlayerPedId()
    SetPedDefaultComponentVariation(ped)
    SetEntityHealth(ped, health)
    SetPedArmour(ped, armour)

    if persistent and GetResourceState('illenium-appearance') == 'started' then
        local appearance = exports['illenium-appearance']:getPedAppearance(ped)
        TriggerServerEvent('illenium-appearance:server:saveAppearance', appearance)
    end

    exports.qbx_core:Notify(locale('ui.ped_changed', model), 'success')
    return true
end)
