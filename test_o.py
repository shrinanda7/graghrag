import asyncio
from backend.core.llm_client import ollama_client
async def main():
    print(ollama_client.check_health())
    ans, log = await ollama_client.generate("What is 2+2?")
    print(ans)
    print(log)

if __name__ == "__main__":
    asyncio.run(main())
