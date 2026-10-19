local coreVehicles = exports.qbx_core:GetVehiclesByName()

Actions = Actions or {}

local vehicleList
Actions['vehicles:list'] = function()
    if vehicleList then return vehicleList end

    vehicleList = {}
    for model, v in pairs(coreVehicles) do
        vehicleList[#vehicleList + 1] = {
            model = model,
            name = v.name or model,
            brand = v.brand or '',
            category = v.category or 'other',
            price = v.price or 0,
        }
    end

    table.sort(vehicleList, function(a, b) return a.name < b.name end)
    return vehicleList
end

local function needVehicle()
    if cache.vehicle then return true end
    exports.qbx_core:Notify(locale('ui.err_no_vehicle'), 'error')
    return false
end

Actions['vehicles:spawn'] = function(data)
    if not data or type(data.model) ~= 'string' then return false end

    local vehNetId = lib.callback.await('qbx_admin:server:spawnVehicle', false, data.model)
    if not vehNetId then return false end

    local veh
    local timeout = GetGameTimer() + 5000
    repeat
        veh = NetToVeh(vehNetId)
        Wait(100)
    until DoesEntityExist(veh) or GetGameTimer() > timeout
    if not DoesEntityExist(veh) then return false end

    TriggerEvent('qb-vehiclekeys:client:AddKeys', qbx.getVehiclePlate(veh))
    SetVehicleNeedsToBeHotwired(veh, false)
    SetVehicleHasBeenOwnedByPlayer(veh, true)
    SetEntityAsMissionEntity(veh, true, false)
    SetVehicleIsStolen(veh, false)
    SetVehicleIsWanted(veh, false)
    SetVehicleEngineOn(veh, true, true, true)
    SetPedIntoVehicle(cache.ped, veh, -1)
    SetVehicleOnGroundProperly(veh)
    SetVehicleRadioEnabled(veh, true)
    SetVehRadioStation(veh, 'OFF')
    return true
end

Actions['vehicles:fix'] = function()
    ExecuteCommand('fix')
    return true
end

Actions['vehicles:buy'] = function()
    if not needVehicle() then return false end
    CloseAdminPanel()
    ExecuteCommand('admincar')
    return true
end

Actions['vehicles:delete'] = function()
    ExecuteCommand('dv')
    return true
end

Actions['vehicles:tune'] = function()
    if not needVehicle() then return false end
    CloseAdminPanel()
    exports.qbx_customs:OpenMenu()
    return true
end

Actions['vehicles:plate'] = function(data)
    if not needVehicle() then return false end
    local plate = data and data.plate
    if type(plate) ~= 'string' or plate == '' then return false end
    if #plate > 8 then
        exports.qbx_core:Notify(locale('ui.err_plate'), 'error')
        return false
    end

    SetVehicleNumberPlateText(cache.vehicle, plate)
    TriggerEvent('qb-vehiclekeys:client:AddKeys', plate)
    return true
end

Actions['vehicles:current'] = function()
    if not cache.vehicle then return false end
    local hash = GetEntityModel(cache.vehicle)
    return {
        name = GetLabelText(GetDisplayNameFromVehicleModel(hash)),
        plate = qbx.getVehiclePlate(cache.vehicle),
        engine = math.floor(GetVehicleEngineHealth(cache.vehicle) / 10),
        body = math.floor(GetVehicleBodyHealth(cache.vehicle) / 10),
        fuel = math.floor(GetVehicleFuelLevel(cache.vehicle)),
    }
end
