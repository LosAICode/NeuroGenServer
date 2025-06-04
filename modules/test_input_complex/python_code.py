def hello_world():
    """A simple function that prints hello world."""
    print("Hello, World!")
    return "success"

class DataProcessor:
    """A class for processing data efficiently."""
    
    def __init__(self, data):
        self.data = data
        self.processed = False
    
    def process(self):
        """Process the data and mark as processed."""
        # Simulate some processing
        self.data = [item.upper() for item in self.data]
        self.processed = True
        return self.data

if __name__ == "__main__":
    processor = DataProcessor(["hello", "world", "from", "python"])
    result = processor.process()
    print(f"Processed data: {result}")