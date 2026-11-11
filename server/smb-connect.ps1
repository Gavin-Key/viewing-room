$ErrorActionPreference = 'Stop'
try {
  $settings = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($settings.password) { $secret = ConvertTo-SecureString $settings.password -AsPlainText -Force }
  elseif ($settings.encrypted) { $secret = ConvertTo-SecureString $settings.encrypted }
  else { $secret = $null }
  if ($secret) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public class ViewingRoomSmb {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct Resource { public int Scope; public int Type; public int Display; public int Usage; public string Local; public string Remote; public string Comment; public string Provider; }
 [DllImport("mpr.dll",CharSet=CharSet.Unicode)] public static extern int WNetAddConnection2(ref Resource resource,string password,string username,int flags);
}
'@
    $resource = New-Object ViewingRoomSmb+Resource
    $resource.Type = 1
    $resource.Remote = $settings.share
    $credential = New-Object System.Management.Automation.PSCredential($settings.username,$secret)
    $code = [ViewingRoomSmb]::WNetAddConnection2([ref]$resource,$credential.GetNetworkCredential().Password,$settings.username,0)
    if ($code -ne 0) { throw "SMB connection failed (Windows error $code). Check the share and credentials. Error 1219 means Windows already has a session using another account." }
    @{ encrypted = (ConvertFrom-SecureString $secret) } | ConvertTo-Json -Compress
  } else { '{"encrypted":null}' }
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
