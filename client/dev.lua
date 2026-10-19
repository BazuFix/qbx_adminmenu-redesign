local showCoords = false
local vehicleDev = false
local vehicleTypes = {'Compacts', 'Sedans', 'SUVs', 'Coupes', 'Muscle', 'Sports Classics', 'Sports', 'Super', 'Motorcycles', 'Off-road', 'Industrial', 'Utility', 'Vans', 'Cycles', 'Boats', 'Helicopters', 'Planes', 'Service', 'Emergency', 'Military', 'Commercial', 'Trains', 'Open Wheel'}

AdminState = AdminState or {}
Actions = Actions or {}

local function displayCoords()
    while showCoords do
        local coords, heading = GetEntityCoords(cache.ped), GetEntityHeading(cache.ped)

        qbx.drawText2d({
            text = ('~o~vector4~w~(%s, %s, %s, %s)'):format(qbx.math.round(coords.x, 2), qbx.math.round(coords.y, 2), qbx.math.round(coords.z, 2), qbx.math.round(heading, 2)),
            coords = vec2(1.0, 0.5),
            scale = 0.5,
            font = 6
        })

        Wait(0)
    end
end

local function displayVehicleInfo()
    while vehicleDev do
        if cache.vehicle then
            local clutch, gear, rpm, temperature = GetVehicleClutch(cache.vehicle), GetVehicleCurrentGear(cache.vehicle), GetVehicleCurrentRpm(cache.vehicle), GetVehicleEngineTemperature(cache.vehicle)
            local oil, angle, body, class = GetVehicleOilLevel(cache.vehicle), GetVehicleSteeringAngle(cache.vehicle), GetVehicleBodyHealth(cache.vehicle), vehicleTypes[GetVehicleClass(cache.vehicle) + 1]
            local dirt, maxSpeed, netId, hash = GetVehicleDirtLevel(cache.vehicle), GetVehicleEstimatedMaxSpeed(cache.vehicle), VehToNet(cache.vehicle), GetEntityModel(cache.vehicle)
            local name = GetLabelText(GetDisplayNameFromVehicleModel(hash))
            qbx.drawText2d({
                text = ('~o~Clutch: ~w~ %s | ~o~Gear: ~w~ %s | ~o~Rpm: ~w~ %s | ~o~Temperature: ~w~ %s'):format(qbx.math.round(clutch, 4), gear, qbx.math.round(rpm, 4), temperature),
                coords = vec2(1.0, 0.575),
                scale = 0.45,
                font = 6
            })
            qbx.drawText2d({
                text = ('~o~Oil: ~w~ %s | ~o~Steering Angle: ~w~ %s | ~o~Body: ~w~ %s | ~o~Class: ~w~ %s'):format(qbx.math.round(oil, 4), qbx.math.round(angle, 4), qbx.math.round(body, 4), class),
                coords = vec2(1.0, 0.600),
                scale = 0.45,
                font = 6
            })
            qbx.drawText2d({
                text = ('~o~Dirt: ~w~ %s | ~o~Est Max Speed: ~w~ %s | ~o~Net ID: ~w~ %s | ~o~Hash: ~w~ %s'):format(qbx.math.round(dirt, 4), qbx.math.round(maxSpeed, 4) * 3.6, netId, hash),
                coords = vec2(1.0, 0.625),
                scale = 0.45,
                font = 6
            })
            qbx.drawText2d({
                text = ('~o~Vehicle Name: ~w~ %s'):format(name),
                coords = vec2(1.0, 0.650),
                scale = 0.45,
                font = 6
            })
            Wait(0)
        else
            Wait(800)
        end
    end
end

Actions['dev:copy'] = function(data)
    local text, message = GetCoordsString(data and data.type)
    if not text then return false end
    exports.qbx_core:Notify(message, 'success')
    return text
end

Actions['dev:coords'] = function()
    showCoords = not showCoords
    AdminState.coords = showCoords
    PushAdminState()
    if showCoords then CreateThread(displayCoords) end
    return showCoords
end

Actions['dev:vehInfo'] = function()
    vehicleDev = not vehicleDev
    AdminState.vehInfo = vehicleDev
    PushAdminState()
    if vehicleDev then CreateThread(displayVehicleInfo) end
    return vehicleDev
end

Actions['dev:live'] = function()
    local coords = GetEntityCoords(cache.ped)
    local vehicle = cache.vehicle
    local data = {
        x = qbx.math.round(coords.x, 2),
        y = qbx.math.round(coords.y, 2),
        z = qbx.math.round(coords.z, 2),
        h = qbx.math.round(GetEntityHeading(cache.ped), 2),
        street = GetStreetNameFromHashKey((GetStreetNameAtCoord(coords.x, coords.y, coords.z))),
        zone = GetLabelText(GetNameOfZone(coords.x, coords.y, coords.z)),
        interior = GetInteriorFromEntity(cache.ped),
    }
    if vehicle then
        local hash = GetEntityModel(vehicle)
        data.vehicle = {
            name = GetLabelText(GetDisplayNameFromVehicleModel(hash)),
            hash = hash,
            plate = qbx.getVehiclePlate(vehicle),
            speed = math.floor(GetEntitySpeed(vehicle) * 3.6),
            engine = math.floor(GetVehicleEngineHealth(vehicle)),
            body = math.floor(GetVehicleBodyHealth(vehicle)),
            class = vehicleTypes[GetVehicleClass(vehicle) + 1],
        }
    end
    return data
end
