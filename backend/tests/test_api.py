import requests
import json
import sys

def test_generate():
    url = "http://localhost:8000/generate"
    payload = {"prompt": "Draw a circle with radius 5 at the origin"}
    
    try:
        print(f"Sending request to {url}...")
        response = requests.post(url, json=payload)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            print("Success!")
            print(json.dumps(response.json(), indent=2))
            return True
        else:
            print("Failed!")
            print(response.text)
            return False
            
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    success = test_generate()
    if not success:
        sys.exit(1)






