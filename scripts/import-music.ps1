[CmdletBinding()]
param(
    [string]$MusicFolder = "C:\Users\Thaksi\Desktop\Tuxie\Tuxie Music's",
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$supportedExtensions = @('.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.wma')
$contentTypes = @{
    '.mp3' = 'audio/mpeg'
    '.m4a' = 'audio/mp4'
    '.aac' = 'audio/aac'
    '.flac' = 'audio/flac'
    '.wav' = 'audio/wav'
    '.ogg' = 'audio/ogg'
    '.opus' = 'audio/opus'
    '.wma' = 'audio/x-ms-wma'
}
$serviceRoleKey = $null
$secureKeyPointer = [IntPtr]::Zero
$client = $null
$shell = $null
$failed = 0
$uploaded = 0

function Get-SongMetadata {
    param(
        [Parameter(Mandatory)]$Shell,
        [Parameter(Mandatory)]$File
    )

    $title = [IO.Path]::GetFileNameWithoutExtension($File.Name) -replace '[_-]+', ' '
    $artist = 'Unknown artist'
    $album = 'Unknown album'
    $duration = $null
    $track = $null
    $directory = $Shell.Namespace($File.DirectoryName)
    $item = $directory.ParseName($File.Name)

    if ($item) {
        try {
            $metadataTitle = $item.ExtendedProperty('System.Title')
            if ($metadataTitle) { $title = [string]$metadataTitle }

            $metadataArtists = $item.ExtendedProperty('System.Music.Artist')
            if ($metadataArtists) { $artist = (@($metadataArtists) -join '; ') }

            $metadataAlbum = $item.ExtendedProperty('System.Music.AlbumTitle')
            if ($metadataAlbum) { $album = [string]$metadataAlbum }

            $metadataDuration = $item.ExtendedProperty('System.Media.Duration')
            if ($metadataDuration -is [ValueType] -and [double]$metadataDuration -gt 0) {
                $duration = [Math]::Round(([double]$metadataDuration / 10000000), 3)
            }

            $metadataTrack = $item.ExtendedProperty('System.Music.TrackNumber')
            if ($metadataTrack) { $track = [string]$metadataTrack }
        }
        catch {
            Write-Verbose "Windows could not read all tags for $($File.Name); filename fallbacks will be used."
        }
    }

    return @{
        title = $title
        artist = $artist
        album = $album
        duration_seconds = $duration
        track_number = $track
    }
}

try {
    if (-not (Test-Path -LiteralPath $MusicFolder -PathType Container)) {
        throw "Music folder not found: $MusicFolder"
    }

    $root = Get-Item -LiteralPath $MusicFolder
    $allFiles = @(Get-ChildItem -LiteralPath $root.FullName -Recurse -File)
    $audioFiles = @($allFiles | Where-Object {
        $supportedExtensions -contains $_.Extension.ToLowerInvariant()
    })
    $skipped = $allFiles.Count - $audioFiles.Count
    $totalBytes = ($audioFiles | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $totalBytes) { $totalBytes = 0 }

    Write-Host "Found $($audioFiles.Count) supported audio files; $skipped other files will be skipped."
    Write-Host ("Total audio size: {0:N2} GB" -f ($totalBytes / 1GB))
    if ($DryRun) {
        Write-Host 'Dry run only. No files were read for upload, no credentials were requested, and nothing was uploaded.'
        return
    }
    if (-not $audioFiles.Count) {
        Write-Host 'Nothing to upload.'
        return
    }

    $confirmation = Read-Host 'Type I CONFIRM RIGHTS only if you own or have permission to stream EVERY audio file in this upload'
    if ($confirmation -cne 'I CONFIRM RIGHTS') {
        throw 'Rights were not confirmed. No audio was uploaded.'
    }

    $projectUrl = $env:SUPABASE_URL
    $bucket = $env:SUPABASE_MUSIC_BUCKET
    if (-not $bucket) { $bucket = 'music-library' }
    if (-not $projectUrl) {
        $projectUrl = Read-Host 'Supabase project URL (https://your-project-id.supabase.co)'
    }
    try {
        $parsedUrl = [Uri]$projectUrl
    }
    catch {
        throw 'Enter a valid Supabase project URL.'
    }
    if ($parsedUrl.Scheme -ne 'https') {
        throw 'The Supabase project URL must use HTTPS.'
    }
    $projectUrl = $parsedUrl.GetLeftPart([UriPartial]::Authority).TrimEnd('/')

    $serviceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY
    if (-not $serviceRoleKey) {
        $secureKey = Read-Host 'Supabase service-role secret (input is hidden)' -AsSecureString
        $secureKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        $serviceRoleKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secureKeyPointer)
    }
    if (-not $serviceRoleKey) {
        throw 'A Supabase service-role secret is required for this private administrator upload.'
    }

    $shell = New-Object -ComObject Shell.Application
    $client = New-Object System.Net.Http.HttpClient
    $client.Timeout = [TimeSpan]::FromMinutes(30)
    $client.DefaultRequestHeaders.Add('apikey', $serviceRoleKey)
    $client.DefaultRequestHeaders.Authorization =
        New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $serviceRoleKey)

    $completed = 0
    foreach ($file in $audioFiles) {
        $completed++
        $rootPrefix = $root.FullName.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
        $relativePath = $file.FullName.Substring($rootPrefix.Length).Replace('\', '/')
        $storageKey = "$($root.Name)/$relativePath"
        $escapedKey = (($storageKey -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
        $mime = $contentTypes[$file.Extension.ToLowerInvariant()]
        $storageUrl = "$projectUrl/storage/v1/object/$([Uri]::EscapeDataString($bucket))/$escapedKey"

        Write-Progress -Activity 'Uploading rights-confirmed music' `
            -Status "$completed of $($audioFiles.Count): $relativePath" `
            -PercentComplete (($completed / $audioFiles.Count) * 100)

        try {
            $request = New-Object System.Net.Http.HttpRequestMessage(
                [System.Net.Http.HttpMethod]::Post, $storageUrl
            )
            $null = $request.Headers.TryAddWithoutValidation('x-upsert', 'true')
            $stream = [IO.File]::OpenRead($file.FullName)
            $request.Content = New-Object System.Net.Http.StreamContent($stream)
            $request.Content.Headers.ContentType =
                New-Object System.Net.Http.Headers.MediaTypeHeaderValue($mime)
            try {
                $response = $client.SendAsync(
                    $request,
                    [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
                ).GetAwaiter().GetResult()
            }
            finally {
                $request.Dispose()
                $stream.Dispose()
            }
            if (-not $response.IsSuccessStatusCode) {
                $status = [int]$response.StatusCode
                $response.Dispose()
                throw "Private storage upload failed with HTTP $status."
            }
            $response.Dispose()

            $song = Get-SongMetadata -Shell $shell -File $file
            $record = @{
                title = $song.title
                artist = $song.artist
                album = $song.album
                duration_seconds = $song.duration_seconds
                track_number = $song.track_number
                file_size_bytes = [long]$file.Length
                storage_key = $storageKey
                content_type = $mime
                rights_verified = $true
                streaming_authorized = $true
                download_allowed = $false
                rights_notes = 'Uploader operator confirmed distribution and streaming rights before upload.'
                rights_verified_at = [DateTimeOffset]::UtcNow.ToString('o')
            }
            $json = ConvertTo-Json -InputObject $record -Depth 6 -Compress
            $songUri = "$projectUrl/rest/v1/songs?on_conflict=storage_key"
            $songContent = New-Object System.Net.Http.StringContent(
                $json,
                [Text.Encoding]::UTF8,
                'application/json'
            )
            $songRequest = New-Object System.Net.Http.HttpRequestMessage(
                [System.Net.Http.HttpMethod]::Post, $songUri
            )
            $null = $songRequest.Headers.TryAddWithoutValidation(
                'Prefer',
                'resolution=merge-duplicates,return=minimal'
            )
            $songRequest.Content = $songContent
            try {
                $songResponse = $client.SendAsync($songRequest).GetAwaiter().GetResult()
            }
            finally {
                $songRequest.Dispose()
            }
            if (-not $songResponse.IsSuccessStatusCode) {
                $status = [int]$songResponse.StatusCode
                $songResponse.Dispose()
                throw "The audio is in private storage, but its catalogue record failed with HTTP $status. Rerun this tool to retry safely."
            }
            $songResponse.Dispose()
            $uploaded++
        }
        catch {
            $failed++
            Write-Warning "Could not fully import '$relativePath': $($_.Exception.Message)"
        }
    }
    Write-Progress -Activity 'Uploading rights-confirmed music' -Completed
    Write-Host "Catalogue entries completed: $uploaded. Files needing retry or inspection: $failed."
    if ($failed -gt 0) {
        exit 1
    }
}
finally {
    if ($client) { $client.Dispose() }
    if ($shell) { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
    if ($secureKeyPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secureKeyPointer)
    }
    $serviceRoleKey = $null
    $env:SUPABASE_SERVICE_ROLE_KEY = $null
}
