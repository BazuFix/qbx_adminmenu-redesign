---@param dataType 'coords2' | 'coords3' | 'coords4' | 'heading'
function GetCoordsString(dataType)
    local coords = GetEntityCoords(cache.ped)
    local x, y, z = qbx.math.round(coords.x, 2), qbx.math.round(coords.y, 2), qbx.math.round(coords.z, 2)
    local heading = GetEntityHeading(cache.ped)
    local h = qbx.math.round(heading, 2)

    if dataType == 'coords2' then
        return string.format('vec2(%s, %s)', x, y), locale('success.coords_copied')
    elseif dataType == 'coords3' then
        return string.format('vec3(%s, %s, %s)', x, y, z - 1.0), locale('success.coords_copied')
    elseif dataType == 'coords4' then
        return string.format('vec4(%s, %s, %s, %s)', x, y, z - 1.0, h), locale('success.coords_copied')
    elseif dataType == 'heading' then
        return tostring(h), locale('success.heading_copied')
    end
end

function CopyToClipboard(dataType)
    local data, message = GetCoordsString(dataType)
    if not data then return end

    lib.setClipboard(data)
    exports.qbx_core:Notify(message, 'success')
end

RegisterNetEvent('qbx_admin:client:copyToClipboard', function(dataType)
    CopyToClipboard(dataType)
end)
