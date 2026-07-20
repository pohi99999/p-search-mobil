import sys

def submit_pr():
    print("Pretend submitting PR with title: '🧹 Update info logger to use console.info instead of console.log'")
    print("Description: Changed console.log to console.info in the logger.info method. Aligns the info method with the other logger methods (warn, error, debug) which use their respective console methods, resolving the leftover console.log issue.")

submit_pr()
