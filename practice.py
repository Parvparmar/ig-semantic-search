def palin(i,s):
    if i>len(s)//2:
        return True
    
    if s[i]==s[len(s)-i-1]:
        return palin(i+1,s)
    else:
        return False
if __name__=="__main__":
    print(palin(0,"ada"))
    