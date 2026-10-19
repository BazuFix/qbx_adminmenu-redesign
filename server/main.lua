lib.versionCheck('BazuFix/qbx_adminmenu-redesign')

local config = require 'config.server'
local isFrozen = {}
local startedAt = os.time()

--- Trigger something on players who have the passed permission
function OnAdmin(permission, cb)
    for k, v in pairs(exports.qbx_core:GetQBPlayers()) do
        if IsPlayerAceAllowed(k, permission) then
            if exports.qbx_core:IsOptin(k) then
                cb(v)
            end
        end
    end
end

--- Checks if the source is inside of the target's routingbucket
--- if not set the source's routingbucket to the target's
function CheckRoutingbucket(source, target)
    local sourceBucket = GetPlayerRoutingBucket(source)
    local targetBucket = GetPlayerRoutingBucket(target)
    if sourceBucket ~= targetBucket then SetPlayerRoutingBucket(source, targetBucket) end
end

local function canUse(source, permission)
    if not IsPlayerAceAllowed(source, permission) then exports.qbx_core:Notify(source, locale('error.no_perms'), 'error') return false end
    if not exports.qbx_core:IsOptin(source) then exports.qbx_core:Notify(source, locale('error.not_optin'), 'error') return false end
    return true
end

local generalOptions = {
    function(selectedPlayer) TriggerClientEvent('qbx_admin:client:killPlayer', selectedPlayer.id) end,
    function(selectedPlayer) TriggerClientEvent('qbx_medical:client:playerRevived', selectedPlayer.id) end,
    function(selectedPlayer)
        if isFrozen[selectedPlayer.id] then
            FreezeEntityPosition(GetPlayerPed(selectedPlayer.id), false)
            isFrozen[selectedPlayer.id] = false
        else
            FreezeEntityPosition(GetPlayerPed(selectedPlayer.id), true)
            isFrozen[selectedPlayer.id] = true
        end
    end,
    function(selectedPlayer, source)
        local coords = GetEntityCoords(GetPlayerPed(selectedPlayer.id))
        CheckRoutingbucket(source, selectedPlayer.id)
        SetEntityCoords(GetPlayerPed(source), coords.x, coords.y, coords.z, false, false, false, false)
    end,
    function(selectedPlayer, source)
        local coords = GetEntityCoords(GetPlayerPed(source))
        CheckRoutingbucket(selectedPlayer.id, source)
        SetEntityCoords(GetPlayerPed(selectedPlayer.id), coords.x, coords.y, coords.z, false, false, false, false)
    end,
    function(selectedPlayer, source)
        local vehicle = GetVehiclePedIsIn(GetPlayerPed(selectedPlayer.id), false)
        local seat = -1
        if vehicle == 0 then return end
        for i = 0, 8, 1 do if GetPedInVehicleSeat(vehicle, i) == 0 then seat = i break end end
        if seat == -1 then return end
        SetPedIntoVehicle(GetPlayerPed(source), vehicle, seat)
    end,
    function(selectedPlayer, _, input)
        exports.qbx_core:SetPlayerBucket(selectedPlayer.id, tonumber(input) or 0)
    end,
}
RegisterNetEvent('qbx_admin:server:playerOptionsGeneral', function(selected, selectedPlayer, input)
    if not canUse(source, config.eventPerms.playerOptionsGeneral) then return end
    if not generalOptions[selected] or type(selectedPlayer) ~= 'table' or not GetPlayerName(selectedPlayer.id) then return end

    ---@diagnostic disable-next-line: redundant-parameter
    generalOptions[selected](selectedPlayer, source, input)
end)

local administrationOptions = {
    function(source, selectedPlayer, input)
        if not canUse(source, config.eventPerms.kick) then return end
        DropPlayer(selectedPlayer.id, input)
    end,
    function(source, selectedPlayer, input)
        if not canUse(source, config.eventPerms.ban) then return end
        if type(input) ~= 'table' then return end
        local permanent = input[5] == true
        local banDuration = (tonumber(input[2]) or 0) * 3600 + (tonumber(input[3]) or 0) * 86400 + (tonumber(input[4]) or 0) * 2629743
        local expire = permanent and 2147483647 or os.time() + banDuration
        local untilText = permanent and locale('ui.ban_permanent') or os.date('%c', expire)
        MySQL.insert.await('INSERT INTO bans (name, license, discord, ip, reason, expire, bannedby) VALUES (?, ?, ?, ?, ?, ?, ?)', {
            GetPlayerName(selectedPlayer.id), GetPlayerIdentifierByType(selectedPlayer.id, 'license'), GetPlayerIdentifierByType(selectedPlayer.id, 'discord'),
            GetPlayerIdentifierByType(selectedPlayer.id, 'ip'), input[1], expire, GetPlayerName(source)
        })
        DropPlayer(selectedPlayer.id, locale('player_options.administration.banreason', input[1], untilText))
    end,
    function(source, selectedPlayer, input)
        if not canUse(source, config.eventPerms.changePerms) then return end
        if input == 'remove' then exports.qbx_core:RemovePermission(selectedPlayer.id) else exports.qbx_core:AddPermission(selectedPlayer.id, input) end
    end,
}
RegisterNetEvent('qbx_admin:server:playerAdministration', function(selected, selectedPlayer, input)
    if not administrationOptions[selected] or type(selectedPlayer) ~= 'table' or not GetPlayerName(selectedPlayer.id) then return end
    administrationOptions[selected](source, selectedPlayer, input)
end)

local playerDataOptions = {
    name = function(target, input)
        if input[1] and input[1] ~= '' then target.PlayerData.charinfo.firstname = input[1] end
        if input[2] and input[2] ~= '' then target.PlayerData.charinfo.lastname = input[2] end
        target.Functions.SetPlayerData('charinfo', target.PlayerData.charinfo)
    end,
    food = function(target, input) target.Functions.SetMetaData('hunger', input[1]) end,
    thirst = function(target, input) target.Functions.SetMetaData('thirst', input[1]) end,
    stress = function(target, input) target.Functions.SetMetaData('stress', input[1]) end,
    armor = function(target, input) target.Functions.SetMetaData('armor', input[1]) SetPedArmour(GetPlayerPed(target.PlayerData.source), input[1]) end,
    phone = function(target, input)
        target.PlayerData.charinfo.phone = input[1]
        target.Functions.SetPlayerData('charinfo', target.PlayerData.charinfo)
    end,
    crafting = function(target, input) target.Functions.SetMetaData('craftingrep', input[1]) end,
    dealer = function(target, input) target.Functions.SetMetaData('dealerrep', input[1]) end,
    cash = function(target, input)
        target.Functions.SetMoney('cash', input[1], 'qbx_adminmenu')
    end,
    bank = function(target, input)
        target.Functions.SetMoney('bank', input[1], 'qbx_adminmenu')
    end,
    job = function(target, input)
        target.Functions.SetJob(input[1], input[2])
    end,
    gang = function(target, input)
        target.Functions.SetGang(input[1], input[2])
    end,
    radio = function(target, input)
        exports['pma-voice']:setPlayerRadio(target.PlayerData.source, input[1])
    end,
}
RegisterNetEvent('qbx_admin:server:changePlayerData', function(selected, selectedPlayer, input)
    if not canUse(source, config.eventPerms.changePlayerData) then return end
    if not playerDataOptions[selected] or type(selectedPlayer) ~= 'table' or type(input) ~= 'table' then return end

    local target = exports.qbx_core:GetPlayer(selectedPlayer.id)
    if not target then return end

    playerDataOptions[selected](target, input)
    exports.qbx_core:Notify(source, locale('ui.saved'), 'success')
end)

RegisterNetEvent('qbx_admin:server:giveAllWeapons', function(weaponType, playerID)
    local src = playerID or source
    local target = exports.qbx_core:GetPlayer(src)

    if not canUse(source, config.eventPerms.giveAllWeapons) then return end
    if not target or not config.weaponList[weaponType] then return end

    for i = 1, #config.weaponList[weaponType], 1 do
        target.Functions.AddItem(config.weaponList[weaponType][i], 1)
    end
end)

lib.callback.register('qbx_admin:callback:getradiolist', function(source, frequency)
    if not canUse(source, config.eventPerms.getRadioList) then return end

    local list = exports['pma-voice']:getPlayersInRadioChannel(tonumber(frequency))
    local players = {}

    for targetSource, _ in pairs(list) do -- cheers Knight who shall not be named
        local player = exports.qbx_core:GetPlayer(targetSource)
        if player then
            players[#players + 1] = {
                id = targetSource,
                name = player.PlayerData.charinfo.firstname .. ' ' .. player.PlayerData.charinfo.lastname .. ' | (' .. GetPlayerName(targetSource) .. ')'
            }
        end
    end
    return players, frequency
end)

local function buildPlayer(src, v)
    local state = Player(src).state
    return {
        id = src,
        cid = v.PlayerData.citizenid,
        name = v.PlayerData.charinfo.firstname .. ' ' .. v.PlayerData.charinfo.lastname .. ' | (' .. GetPlayerName(src) .. ')',
        charName = v.PlayerData.charinfo.firstname .. ' ' .. v.PlayerData.charinfo.lastname,
        playerName = GetPlayerName(src),
        food = state.hunger or v.PlayerData.metadata.hunger,
        water = state.thirst or v.PlayerData.metadata.thirst,
        stress = state.stress or v.PlayerData.metadata.stress,
        armor = v.PlayerData.metadata.armor,
        phone = v.PlayerData.charinfo.phone,
        craftingrep = v.PlayerData.metadata.craftingrep,
        dealerrep = v.PlayerData.metadata.dealerrep,
        cash = v.PlayerData.money.cash,
        bank = v.PlayerData.money.bank,
        job = v.PlayerData.job.label .. ' | ' .. v.PlayerData.job.grade.level,
        jobName = v.PlayerData.job.name,
        gang = v.PlayerData.gang.label,
        radio = state.radioChannel or 0,
        ping = GetPlayerPing(src),
        bucket = GetPlayerRoutingBucket(src),
        frozen = isFrozen[src] or false,
        health = GetEntityHealth(GetPlayerPed(src)),
        license = GetPlayerIdentifierByType(src, 'license') or 'Unknown',
        discord = GetPlayerIdentifierByType(src, 'discord') or 'Not Linked',
        steam = GetPlayerIdentifierByType(src, 'steam') or 'Not Linked',
    }
end

lib.callback.register('qbx_admin:server:getPlayers', function(source)
    if not canUse(source, config.eventPerms.useMenu) then return end

    local players = {}
    for k, v in pairs(exports.qbx_core:GetQBPlayers()) do
        players[#players + 1] = buildPlayer(k, v)
    end
    table.sort(players, function(a, b) return a.id < b.id end)
    return players
end)

lib.callback.register('qbx_admin:server:getPlayer', function(source, playerToGet)
    if not canUse(source, config.eventPerms.useMenu) then return end

    local player = exports.qbx_core:GetPlayer(tonumber(playerToGet))
    if not player then return end

    return buildPlayer(player.PlayerData.source, player)
end)

lib.callback.register('qbx_admin:server:clothingMenu', function(source, target)
    if not canUse(source, config.eventPerms.clothingMenu) then return false end

    TriggerClientEvent('qb-clothing:client:openMenu', target)

    return true
end)

lib.callback.register('qbx_admin:server:canUseMenu', function(source)
    return canUse(source, config.eventPerms.useMenu)
end)

lib.callback.register('qbx_admin:server:spawnVehicle', function(source, model)
    if not canUse(source, config.eventPerms.useMenu) then return end

    local ped = GetPlayerPed(source)
    local netId, vehicle = qbx.spawnVehicle({
        model = model,
        spawnSource = ped,
        warp = true,
    })

    exports.qbx_vehiclekeys:GiveKeys(source, vehicle)
    return netId
end)

local economyCache, economyCachedAt = nil, 0

local function safeDecode(str)
    if type(str) ~= 'string' then return {} end
    local ok, data = pcall(json.decode, str)
    return ok and type(data) == 'table' and data or {}
end

local function buildEconomy()
    local moneyTypes = config.economy.moneyTypes
    local rows = MySQL.query.await('SELECT citizenid, license, charinfo, money FROM players') or {}
    local online = {}
    for src, player in pairs(exports.qbx_core:GetQBPlayers()) do
        online[player.PlayerData.citizenid] = { id = src, money = player.PlayerData.money, charinfo = player.PlayerData.charinfo }
    end

    local totals = { total = 0, characters = 0 }
    for _, t in ipairs(moneyTypes) do totals[t] = 0 end
    local list = {}

    for i = 1, #rows do
        local row = rows[i]
        local live = online[row.citizenid]
        local money = live and live.money or safeDecode(row.money)
        local charinfo = live and live.charinfo or safeDecode(row.charinfo)

        local entry = {
            citizenid = row.citizenid,
            name = ('%s %s'):format(charinfo.firstname or '?', charinfo.lastname or ''),
            online = live ~= nil,
            id = live and live.id,
            total = 0,
        }
        for _, t in ipairs(moneyTypes) do
            local amount = tonumber(money[t]) or 0
            entry[t] = amount
            entry.total += amount
            totals[t] += amount
        end
        totals.total += entry.total
        totals.characters += 1
        list[#list + 1] = entry
    end

    table.sort(list, function(a, b) return a.total > b.total end)
    local top = {}
    for i = 1, math.min(config.economy.topCount, #list) do top[i] = list[i] end

    totals.average = totals.characters > 0 and math.floor(totals.total / totals.characters) or 0
    totals.onlineCount = 0
    for _ in pairs(online) do totals.onlineCount += 1 end

    return { totals = totals, top = top, moneyTypes = moneyTypes, updatedAt = os.time() }
end

lib.callback.register('qbx_admin:server:getEconomy', function(source, force)
    if not canUse(source, config.eventPerms.economy) then return false end

    if force or not economyCache or os.time() - economyCachedAt >= config.economy.cacheSeconds then
        economyCache = buildEconomy()
        economyCachedAt = os.time()
    end
    return economyCache
end)

local function hasPerm(source, perm)
    return IsPlayerAceAllowed(source, perm) == true
end

lib.callback.register('qbx_admin:server:getPanelData', function(source)
    if not canUse(source, config.commandPerms.useMenu) then return false end

    local cmd, ev = config.commandPerms, config.eventPerms
    local playerCount = 0
    for _ in pairs(exports.qbx_core:GetQBPlayers()) do playerCount += 1 end

    return {
        me = { id = source, name = GetPlayerName(source) },
        perms = {
            reports = hasPerm(source, cmd.reportReply),
            noclip = hasPerm(source, cmd.noclip),
            names = hasPerm(source, cmd.names),
            blips = hasPerm(source, cmd.blips),
            saveVehicle = hasPerm(source, cmd.saveVehicle),
            setModel = hasPerm(source, cmd.setModel),
            dev = hasPerm(source, cmd.dev),
            general = hasPerm(source, ev.playerOptionsGeneral),
            kick = hasPerm(source, ev.kick),
            ban = hasPerm(source, ev.ban),
            changePerms = hasPerm(source, ev.changePerms),
            changePlayerData = hasPerm(source, ev.changePlayerData),
            giveAllWeapons = hasPerm(source, ev.giveAllWeapons),
            radioList = hasPerm(source, ev.getRadioList),
            clothing = hasPerm(source, ev.clothingMenu),
            startDm = hasPerm(source, config.reports.startDmPerm),
            economy = hasPerm(source, ev.economy),
            characterKill = hasPerm(source, ev.characterKill),
            bans = hasPerm(source, ev.bans),
            offlinePlayers = hasPerm(source, ev.offlinePlayers),
            givePed = hasPerm(source, ev.givePed),
        },
        server = {
            name = GetConvar('sv_projectName', GetConvar('sv_hostname', 'Qbox Server')),
            players = playerCount,
            maxPlayers = GetConvarInt('sv_maxclients', 48),
            uptime = os.time() - startedAt,
            time = os.time(),
            reports = GetReportStats(),
        },
    }
end)
