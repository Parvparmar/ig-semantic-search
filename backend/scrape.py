import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

CHROME_PATH = "C:/Users/Parvp/AppData/Local/Google/Chrome/User Data" 
PROFILE_DIR = "Default"  # Or "Profile 1", etc.
SAVED_REELS_URL = "https://www.instagram.com/reels/saved/"

def scrape_saved_reels():

    options = Options()
    # This tells Selenium: "Don't start a new Chrome, just talk to the one on port 9222"
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
        
    # Optional: run in background (headless) - though not recommended for first run
    # options.add_argument("--headless")
    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 10)

    try:
        driver.get(SAVED_REELS_URL)
        print("Waiting for page to load...")
        
        # Click the first reel to start the "modal" view
        first_reel = wait.until(EC.presence_of_element_located((By.XPATH, "//a[contains(@href, '/reel/')]")))
        first_reel.click()

        with open("reelsscraped.txt", "w") as f:
            last_url = ""
            while True:
                time.sleep(1.5) # Allow URL to update
                current_url = driver.current_url
                
                if current_url == last_url:
                    print("Reached the end or got stuck.")
                    break
                
                f.write(current_url + "\n")
                print(f"Saved: {current_url}")
                last_url = current_url

                # Click the "Next" button
                try:
                    next_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "svg[aria-label='Next']")))
                    next_button.click()
                except:
                    print("Next button not found. Finished.")
                    break
    except Exception as e:
        print(f"connection failed: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    scrape_saved_reels()