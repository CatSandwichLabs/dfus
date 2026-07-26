#!/usr/bin/env python3
import os
import sys
import json
import time
import argparse
import hashlib
import urllib.request
import urllib.error

API_BASE = "https://dfus-backend.onrender.com"
CHUNK_SIZE = 5 * 1024 * 1024  # 5 MB

def get_hash(filepath):
    print("Hashing file...")
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while True:
            data = f.read(65536)
            if not data:
                break
            sha256.update(data)
    return sha256.hexdigest()

def upload_file(filepath):
    if not os.path.exists(filepath):
        print(f"Error: File '{filepath}' not found.")
        sys.exit(1)
        
    file_size = os.path.getsize(filepath)
    file_name = os.path.basename(filepath)
    file_hash = get_hash(filepath)
    
    print(f"File: {file_name}")
    print(f"Size: {file_size / (1024*1024):.2f} MB")
    print(f"Hash: {file_hash}")
    
    # 1. Init Session
    req = urllib.request.Request(f"{API_BASE}/api/upload/init", data=json.dumps({
        "fileName": file_name,
        "sizeBytes": file_size,
        "fileHash": file_hash,
        "totalChunks": (file_size + CHUNK_SIZE - 1) // CHUNK_SIZE
    }).encode('utf-8'), headers={'Content-Type': 'application/json'})
    
    try:
        res = urllib.request.urlopen(req)
        session_data = json.loads(res.read().decode('utf-8'))
        session_id = session_data['sessionId']
    except urllib.error.URLError as e:
        print(f"Init Error: {e.reason}")
        sys.exit(1)
        
    print(f"Session started: {session_id}")
    
    # 2. Upload Chunks
    with open(filepath, 'rb') as f:
        chunk_idx = 0
        while True:
            chunk_data = f.read(CHUNK_SIZE)
            if not chunk_data:
                break
                
            print(f"Uploading chunk {chunk_idx + 1}...")
            
            # Simple retry loop
            for attempt in range(3):
                try:
                    req = urllib.request.Request(f"{API_BASE}/api/upload/{session_id}/chunk", data=chunk_data)
                    req.add_header('X-Chunk-Index', str(chunk_idx))
                    req.add_header('Content-Type', 'application/octet-stream')
                    urllib.request.urlopen(req)
                    break
                except urllib.error.URLError as e:
                    if attempt == 2:
                        print(f"Failed to upload chunk {chunk_idx}: {e.reason}")
                        sys.exit(1)
                    time.sleep(1)
                    
            chunk_idx += 1
            
    # 3. Merge
    print("Merging file on server...")
    req = urllib.request.Request(f"{API_BASE}/api/upload/merge", data=json.dumps({
        "sessionId": session_id,
        "password": ""
    }).encode('utf-8'), headers={'Content-Type': 'application/json'})
    
    try:
        res = urllib.request.urlopen(req)
        final_data = json.loads(res.read().decode('utf-8'))
        print("\n--- UPLOAD SUCCESS ---")
        print(f"Download ID: {final_data['shareId']}")
    except urllib.error.URLError as e:
        print(f"Merge Error: {e.reason}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DFUS Command Line Uploader")
    parser.add_argument("file", help="File to upload")
    args = parser.parse_args()
    upload_file(args.file)
