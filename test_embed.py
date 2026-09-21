import asyncio
from backend.core.llm_client import ollama_client
async def main():
    vec, log = await ollama_client.get_embedding("test query")
    print(len(vec), log)

if __name__ == "__main__":
    asyncio.run(main())
